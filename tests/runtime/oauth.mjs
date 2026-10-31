// Isolated workerd runtime: real Sally Worker + OAuth provider + D1/KV.
// Every upstream request is intercepted. No real email, account or credential is used.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { proxyRequest } from "../../vercel-proxy/lib/proxy.mjs";
const proxyMode = process.env.SALLY_TEST_PROXY === "1";
const proxyKey = "synthetic-proxy-runtime-key-".repeat(3);
const origin = "https://sally-runtime.example";
const upstreamOrigin = "https://sally-upstream.invalid";
const account = {
  email: "sally-runtime@example.invalid",
  userId: "isolated-account",
  token: "synthetic-upstream-session-only-for-tests",
};
let renewalFails = false;
const counts = { send: 0, verify: 0, recipe: 0, explain: 0 };
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: readdirSync("dist")
      .filter(
        (n) => n === "index.js" || n.endsWith(".html") || n.endsWith(".css"),
      )
      .sort((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0))
      .map((n) => ({
        type: n === "index.js" ? "ESModule" : "Text",
        path: "dist/" + n,
      })),
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    bindings: {
      PUBLIC_ORIGIN: origin,
      ...(proxyMode
        ? { PROXY_ONLY: "true", PROXY_SHARED_SECRET: proxyKey }
        : {}),
      SALLY_API_URL: upstreamOrigin,
      USAGE_HMAC_KEY: "test-only-key-".repeat(5),
    },
    kvNamespaces: ["OAUTH_KV"],
    d1Databases: ["DB"],
    cf: false,
    outboundService: async (req) => {
      assert.equal(
        new URL(req.url).origin,
        upstreamOrigin,
        "Runtime tests must never make real network requests",
      );
      const path = new URL(req.url).pathname;
      const body = await req.json();
      if (path === "/api/auth/send-email-otp") {
        assert.equal(body.email, account.email);
        counts.send++;
        return Response.json({ success: true });
      }
      if (path === "/api/auth/verify-email-otp") {
        assert.deepEqual(body, { email: account.email, code: "424242" });
        counts.verify++;
        return Response.json({
          success: true,
          token: account.token,
          user: { id: account.userId, email: account.email },
        });
      }
      if (path === "/api/auth/guest-session")
        return renewalFails
          ? new Response("fixture outage", { status: 503 })
          : Response.json({
              data: { token: "synthetic-renewed-guest-session-for-tests" },
            });
      assert.equal(
        req.headers.get("Authorization"),
        `Bearer ${account.token}`,
        "MCP token must be exchanged for encrypted upstream identity inside Worker",
      );
      if (path === "/api/ai/generate-list") {
        counts.recipe++;
        return Response.json({
          items: [{ name: "pasta", quantity: 200, unit: "g" }],
          servings: 2,
        });
      }
      if (path === "/api/extension/ai/sense-check") {
        counts.explain++;
        return Response.json({
          verdict: "confirm",
          reason: "fixture match",
          confidence: 0.9,
          model: "fixture-luna",
          fallback: false,
        });
      }
      throw new Error("Unexpected outbound fixture route");
    },
  }),
);
try {
  const db = await mf.getD1Database("DB");
  for (const statement of readFileSync("migrations/0001_usage.sql", "utf8")
    .split(";")
    .filter((s) => s.trim()))
    await db.prepare(statement).run();
  async function dispatch(path, init = {}) {
    if (!proxyMode) return mf.dispatchFetch(new URL(path, origin), init);
    return proxyRequest(
      new Request(new URL(path, origin), init),
      { workerOrigin: "https://worker-origin.invalid", proxyKey },
      (url, options) => mf.dispatchFetch(url, options),
      "198.51.100.42",
    );
  }
  if (proxyMode) {
    const bypass = await mf.dispatchFetch("https://worker-origin.invalid/mcp");
    assert.equal(
      bypass.status,
      404,
      "Private Worker must reject bypassing Vercel",
    );
  }
  const cookies = new Map();
  async function request(path, init = {}) {
    const headers = new Headers(init.headers);
    if (cookies.size)
      headers.set(
        "Cookie",
        [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    const res = await dispatch(new URL(path, origin), {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const split = pair.indexOf("=");
      const name = pair.slice(0, split),
        value = pair.slice(split + 1);
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    return res;
  }
  const register = await request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Sally isolated runtime test",
      redirect_uris: ["http://127.0.0.1/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert.equal(register.status, 201);
  const client = await register.json();
  const verifier = "synthetic-test-verifier-".repeat(3);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URL("/authorize", origin);
  for (const [key, value] of Object.entries({
    client_id: client.client_id,
    redirect_uri: "http://127.0.0.1/callback",
    response_type: "code",
    scope: "sally:tools offline_access",
    resource: origin + "/mcp",
    state: "isolated-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }))
    authorize.searchParams.set(key, value);
  const consent = await request(authorize);
  assert.equal(consent.status, 200);
  const consentHtml = await consent.text();
  // HTML form validation must not prevent a user from refusing access.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 900, height: 760 },
    });
    let deniedWithoutEmail = false;
    let consentPostOrigin;
    await page.route(origin + "/**", async (route) => {
      if (route.request().method() === "POST") {
        consentPostOrigin = route.request().headers()["origin"];
        deniedWithoutEmail =
          new URLSearchParams(route.request().postData()).get("decision") ===
          "deny";
        await route.fulfill({
          contentType: "text/html",
          body: "<h1>Access denied</h1>",
        });
      } else
        await route.fulfill({
          headers: Object.fromEntries(consent.headers),
          body: consentHtml,
        });
    });
    await page.goto(origin + "/authorize");
    assert.equal(
      await page
        .getByText(
          "Match groceries, explain choices, convert recipes, and prepare a shopping handoff.",
          { exact: true },
        )
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("heading", { name: "Sally by HeySalad®", exact: true })
        .count(),
      0,
      "The duplicate heading was removed at Peter’s request",
    );
    assert.equal(
      await page
        .getByRole("img", { name: "HeySalad logo", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page.getByText("love your food", { exact: true }).count(),
      1,
    );
    const loadedFonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts)
        .filter((f) => f.status === "loaded")
        .map((f) => f.family);
    });
    assert.ok(
      loadedFonts.includes("Figtree"),
      "The form’s bundled Figtree font must load",
    );
    await page.screenshot({
      path: "submission/screenshots/consent-runtime.png",
      fullPage: true,
    });
    const submitted = page.waitForResponse(
      (r) => r.request().method() === "POST",
      { timeout: 2000 },
    );
    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await submitted;
    assert.equal(
      consentPostOrigin,
      origin,
      "Consent headers must preserve same-origin form POST Origin for CSRF validation",
    );
    assert.equal(
      deniedWithoutEmail,
      true,
      "A user must be able to decline consent without supplying an email",
    );
  } finally {
    await browser.close();
  }
  const consentHandle = consentHtml.match(/name="handle" value="([^"]+)"/)[1];
  const send = await request("/authorize/send", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({
      handle: consentHandle,
      email: account.email,
      decision: "approve",
    }),
  });
  assert.equal(send.status, 200);
  const loginHtml = await send.text();
  const loginHandle = loginHtml.match(/name="handle" value="([^"]+)"/)[1];
  assert.equal(counts.send, 1);
  const complete = await request("/authorize/complete", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({ handle: loginHandle, code: "424242" }),
  });
  assert.equal(complete.status, 302);
  const redirect = new URL(complete.headers.get("Location"));
  assert.equal(redirect.searchParams.get("state"), "isolated-state");
  assert.equal(redirect.searchParams.get("iss"), origin);
  const code = redirect.searchParams.get("code");
  assert.ok(code);
  assert.equal(counts.verify, 1);
  async function tokenExchange(values) {
    return request("/oauth/token", {
      method: "POST",
      body: new URLSearchParams({ client_id: client.client_id, ...values }),
    });
  }
  const tokens = await tokenExchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: "http://127.0.0.1/callback",
    code_verifier: verifier,
    resource: origin + "/mcp",
  });
  assert.equal(tokens.status, 200);
  const granted = await tokens.json();
  assert.ok(granted.access_token);
  assert.ok(granted.refresh_token);
  assert.ok(!JSON.stringify(granted).includes(account.token));
  let id = 0;
  async function rpc(name, args, accessToken = granted.access_token) {
    const res = await request("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++id,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(!data.error, JSON.stringify(data.error));
    assert.ok(!data.result.isError, JSON.stringify(data.result.content));
    return data.result;
  }
  assert.equal(
    (await rpc("basket_link", { list: ["milk"], retailer: "ocado" }))
      .structuredContent.checkout,
    false,
  );
  assert.equal(
    (await rpc("recipe_to_list", { recipe_text: "Pasta for two", servings: 2 }))
      .structuredContent.items[0].quantity,
    200,
  );
  assert.equal(
    (
      await rpc("explain_match", {
        item: { name: "milk" },
        product: {
          id: "fixture",
          name: "Whole milk",
          price: 1.8,
          currency: "GBP",
          pack_size: "2 pints",
          url: "https://www.ocado.com/",
          confidence: 0.9,
        },
      })
    ).structuredContent.matches,
    true,
  );
  const refreshed = await tokenExchange({
    grant_type: "refresh_token",
    refresh_token: granted.refresh_token,
    resource: origin + "/mcp",
  });
  assert.equal(refreshed.status, 200);
  const rotated = await refreshed.json();
  assert.notEqual(rotated.refresh_token, granted.refresh_token);
  await rpc(
    "basket_link",
    { list: ["milk"], retailer: "tesco" },
    rotated.access_token,
  );
  const rows = await db.prepare("SELECT * FROM usage_logs").all();
  assert.equal(rows.results.length, 4);
  const stored = JSON.stringify(rows.results);
  for (const sensitive of [
    account.email,
    account.userId,
    account.token,
    "Pasta for two",
  ])
    assert.ok(!stored.includes(sensitive));
  const metadata = await (
    await request("/.well-known/oauth-authorization-server")
  ).json();
  const revoked = await request(metadata.revocation_endpoint, {
    method: "POST",
    body: new URLSearchParams({
      client_id: client.client_id,
      token: rotated.refresh_token,
      token_type_hint: "refresh_token",
    }),
  });
  assert.equal(revoked.status, 200);
  const rejected = await request("/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rotated.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 99,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(rejected.status, 401);
  // Test replay after the normal lifecycle: this provider revokes the grant on code replay.
  const reused = await tokenExchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: "http://127.0.0.1/callback",
    code_verifier: verifier,
    resource: origin + "/mcp",
  });
  assert.equal(reused.status, 400);
  // Prove retention is independent of the upstream guest-renewal service.
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "INSERT INTO usage_logs(subject,tool,status,duration_ms,created_at) VALUES(?,?,?,?,?)",
    )
    .bind("expired-fixture", "basket_link", "ok", 1, now - 31 * 86400)
    .run();
  await db
    .prepare(
      "INSERT INTO rate_limits(subject,bucket,window,count,expires_at) VALUES(?,?,?,?,?)",
    )
    .bind("expired-fixture", "requests", 1, 1, now - 1)
    .run();
  renewalFails = true;
  const worker = await mf.getWorker();
  try {
    await worker.scheduled({ cron: "17 3 * * *", scheduledTime: Date.now() });
  } catch {
    /* A renewal error may be reported after cleanup. */
  }
  const expiredUsage = await db
    .prepare("SELECT count(*) AS n FROM usage_logs WHERE subject=?")
    .bind("expired-fixture")
    .first();
  const expiredQuota = await db
    .prepare("SELECT count(*) AS n FROM rate_limits WHERE subject=?")
    .bind("expired-fixture")
    .first();
  assert.equal(
    expiredUsage.n,
    0,
    "Expired usage must be deleted even when guest renewal fails",
  );
  assert.equal(
    expiredQuota.n,
    0,
    "Expired quotas must be deleted even when guest renewal fails",
  );
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM usage_logs").first()).n,
    4,
    "Current usage must be retained",
  );
  // Use real browser cookies for two overlapping sign-in windows. The manual
  // request jar above cannot detect browser cookie rejection or replacement.
  const browserRegistration = await request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Synthetic browser client",
      redirect_uris: ["https://chatgpt.example/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }),
  });
  assert.equal(browserRegistration.status, 201);
  const browserClient = await browserRegistration.json();
  const browserAuthorize = new URL(authorize);
  browserAuthorize.searchParams.set("client_id", browserClient.client_id);
  browserAuthorize.searchParams.set(
    "redirect_uri",
    "https://chatgpt.example/callback",
  );
  const authBrowser = await chromium.launch();
  try {
    const context = await authBrowser.newContext();
    await context.route(origin + "/**", async (route) => {
      const incoming = route.request();
      const result = await dispatch(incoming.url(), {
        method: incoming.method(),
        headers: await incoming.allHeaders(),
        body: incoming.postDataBuffer() || undefined,
        redirect: "manual",
      });
      const headers = Object.fromEntries(result.headers);
      delete headers["set-cookie"];
      delete headers["content-length"];
      const setCookies = result.headers.getSetCookie();
      if (setCookies.length) headers["set-cookie"] = setCookies.join("\n");
      await route.fulfill({
        status: result.status,
        headers,
        body: await result.text(),
      });
    });
    await context.route("https://chatgpt.example/callback**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<h1>Connected</h1>" }),
    );
    const first = await context.newPage(),
      second = await context.newPage();
    for (const page of [first, second]) {
      await page.goto(browserAuthorize.href);
      if (page === first) {
        mkdirSync(".wrangler/auth-style-preview", { recursive: true });
        for (const viewport of [
          { width: 1280, height: 1000 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport);
          await page.evaluate(() => document.fonts.ready);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            "Consent must fit both desktop and mobile without horizontal scrolling",
          );
          const emailBox = await page
            .getByRole("textbox", { name: "Sally account email", exact: true })
            .boundingBox();
          const buttonBox = await page
            .getByRole("button", { name: "Email a sign-in code", exact: true })
            .boundingBox();
          assert.ok(
            emailBox &&
              buttonBox &&
              Math.abs(emailBox.width - buttonBox.width) < 1,
          );
          await page.screenshot({
            path: `.wrangler/auth-style-preview/consent-${viewport.width}.png`,
            fullPage: true,
          });
        }
      }
      await page
        .getByRole("textbox", { name: "Sally account email", exact: true })
        .fill(account.email);
      await page
        .getByRole("button", { name: "Email a sign-in code", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Email code", exact: true })
        .waitFor();
      if (page === first)
        await page.screenshot({
          path: ".wrangler/auth-style-preview/consent-code-mobile.png",
          fullPage: true,
        });
    }
    for (const page of [first, second]) {
      await page
        .getByRole("textbox", { name: "Email code", exact: true })
        .fill("424242");
      // The callback is a synthetic external client, so verify the browser's
      // navigation request and redeem its code rather than rendering that host.
      const navigation = page.waitForRequest(
        (r) => r.url().startsWith("https://chatgpt.example/callback"),
        { timeout: 3000 },
      );
      await page
        .getByRole("button", { name: "Connect Sally", exact: true })
        .click({ noWaitAfter: true });
      const callback = new URL((await navigation).url());
      assert.equal(callback.searchParams.get("state"), "isolated-state");
      assert.equal(callback.searchParams.get("iss"), origin);
      assert.ok(callback.searchParams.get("code"));
      const exchanged = await request("/oauth/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: browserClient.client_id,
          grant_type: "authorization_code",
          code: callback.searchParams.get("code"),
          redirect_uri: "https://chatgpt.example/callback",
          code_verifier: verifier,
          resource: origin + "/mcp",
        }),
      });
      assert.equal(
        exchanged.status,
        200,
        "Each overlapping browser sign-in must redeem its own code",
      );
    }
  } finally {
    await authBrowser.close();
  }
  console.log(
    proxyMode ? "Via the actual Vercel proxy module:" : "Direct Worker:",
  );
  console.log(
    "PASS: isolated workerd OAuth code + PKCE, protected tools, refresh rotation, revocation, pseudonymous D1 usage, retention during upstream outage, and two overlapping browser sign-ins with callback navigation + PKCE redemption.",
  );
} finally {
  await mf.dispose();
}
