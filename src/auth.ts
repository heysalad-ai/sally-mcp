import fontFaces from "../ui/brand-fonts.css";
import authStyles from "../ui/auth.css";
import { AuthorizationError } from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import type { Env } from "./types";
import { upstream } from "./tools";
import { limit, pseudonym } from "./privacy";
import { DISPLAY_NAME, HEYSALAD_WORDMARK_SVG } from "./brand";
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const html = (
  body: string,
  headers = new Headers(),
  status = 200,
  redirectUri?: string,
) => {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "same-origin");
  headers.set(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; font-src data:; form-action 'self'${redirectUri ? " " + new URL(redirectUri).origin : ""}; frame-ancestors 'none'; base-uri 'none'`,
  );
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect ${DISPLAY_NAME}</title><style>${fontFaces}${authStyles}</style></head><body><main class="auth-card" aria-label="Connect Sally"><header class="auth-header"><div class="brand-mark" role="img" aria-label="HeySalad logo">${HEYSALAD_WORDMARK_SVG}</div><p class="tagline">love your food</p></header><div class="auth-content">${body}</div><footer class="company-footer">HeySalad Inc. · <a href="https://heysalad.ai/sally/privacy">Privacy</a></footer></main></body></html>`,
    { status, headers },
  );
};
export async function authorize(req: Request, env: Env) {
  const oauth = env.OAUTH_PROVIDER;
  const scopeLabel = (scope: string) =>
    ({
      "sally:tools":
        "Match groceries, explain choices, convert recipes, and prepare a shopping handoff.",
      offline_access: "Keep this connection available for up to one day.",
    })[scope] ?? scope;
  let stage = "consent";
  try {
    if (req.method === "GET") {
      const auth = await oauth.parseAuthRequest(req);
      const details = await oauth.describeConsent(auth);
      const consent = await oauth.beginConsent(auth);
      return html(
        `<section class="consent-details" aria-label="Connection details"><p>Connect to <strong>${esc(details.clientName)}</strong>. ${details.clientDomain ? `Publisher: ${esc(details.clientDomain)}.` : "The client name is self-declared."}</p><p>After signing in, you’ll return to ${details.redirectIsLoopback ? `the app on this device (<strong>${esc(details.redirectHost)}</strong>)` : `<strong>${esc(details.redirectHost)}</strong>`}.</p>${details.redirectIsLoopback ? "<p>This grants access to an app on your computer. Continue only if you started this sign-in.</p>" : ""}<p>This client can:</p><ul>${details.scope.map((scope) => `<li>${esc(scopeLabel(scope))}</li>`).join("")}</ul><p class="safety-note">You always check out and pay.</p></section><form method="post" action="/authorize/send"><input type="hidden" name="handle" value="${esc(consent.handle)}"><label>Email Address<input name="email" type="email" aria-label="Sally account email" placeholder="you@example.com" required autocomplete="email" maxlength="254" aria-describedby="email-hint"></label><small class="hint" id="email-hint">We’ll send you a 6-digit sign-in code.</small><button name="decision" value="approve">Email a sign-in code</button><button name="decision" value="deny" formnovalidate>Deny</button></form>`,
        consent.headers,
        200,
        auth.redirectUri,
      );
    }
    if (
      req.method !== "POST" ||
      req.headers.get("Origin") !== env.PUBLIC_ORIGIN
    )
      return html(
        "<p>Invalid sign-in request. Start again from your client.</p>",
        undefined,
        400,
      );
    const form = await req.formData();
    const handle = z.string().min(20).max(500).parse(form.get("handle"));
    if (form.get("decision") === "deny") {
      const r = await oauth.denyConsent(req, handle);
      r.headers.set("Location", r.redirectTo);
      return new Response(null, { status: 302, headers: r.headers });
    }
    if (new URL(req.url).pathname === "/authorize/send") {
      const approved = await oauth.approveConsent(req, handle);
      const email = z
        .string()
        .email()
        .max(254)
        .parse(form.get("email"))
        .trim()
        .toLowerCase();
      const ip = await pseudonym(
        env,
        `auth:${req.headers.get("CF-Connecting-IP") ?? "local"}`,
      );
      const mailbox = await pseudonym(env, `email:${email}`);
      if (
        !(await limit(env, ip, "otp-send", 5, 600)) ||
        !(await limit(env, mailbox, "otp-email", 3, 600))
      )
        return html(
          "<p>Too many sign-in requests. Try again later.</p>",
          approved.headers,
          429,
        );
      stage = "email";
      z.object({ success: z.literal(true) }).parse(
        await upstream(env, "/api/auth/send-email-otp", { email }),
      );
      stage = "session";
      const nonce = crypto.randomUUID();
      const browser = crypto.randomUUID();
      // Temporary account identity only; never store the OTP. Browser-bound and expires after 10 minutes.
      await env.OAUTH_KV.put(
        `login:${nonce}`,
        JSON.stringify({ email, auth: approved.request, browser }),
        { expirationTtl: 600 },
      );
      approved.headers.append(
        "Set-Cookie",
        `__Host-sally-login-${nonce}=${browser}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      );
      return html(
        `<p>Enter the code sent to your Sally email. Approving connects this client to Sally.</p><form method="post" action="/authorize/complete"><input type="hidden" name="handle" value="${nonce}"><label>Email code<input name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required autocomplete="one-time-code" aria-describedby="code-hint"></label><small class="hint" id="code-hint">Your code expires after 10 minutes.</small><button>Connect Sally</button></form>`,
        approved.headers,
        200,
        approved.request.redirectUri,
      );
    }
    if (new URL(req.url).pathname !== "/authorize/complete")
      return html("<p>Not found.</p>", undefined, 404);
    const loginHandle = z.string().uuid().parse(handle);
    const saved = await env.OAUTH_KV.get<{
      email: string;
      auth: Parameters<typeof oauth.completeAuthorization>[0]["request"];
      browser: string;
    }>(`login:${loginHandle}`, "json");
    const browser = req.headers
      .get("Cookie")
      ?.match(
        new RegExp(`(?:^|;\\s*)__Host-sally-login-${loginHandle}=([^;]+)`),
      )?.[1];
    if (!saved || saved.browser !== browser)
      return html("<p>Sign-in expired. Start again.</p>", undefined, 400);
    if (
      !(await limit(
        env,
        await pseudonym(env, `login:${handle}`),
        "otp-verify",
        5,
        600,
      ))
    )
      return html(
        "<p>Too many code attempts. Start again.</p>",
        undefined,
        429,
      );
    const code = z
      .string()
      .regex(/^\d{6}$/)
      .parse(form.get("code"));
    const signed = z
      .object({
        token: z.string().min(20),
        user: z.object({ id: z.string().min(1) }),
      })
      .parse(
        await upstream(env, "/api/auth/verify-email-otp", {
          email: saved.email,
          code,
        }),
      );
    await env.OAUTH_KV.delete(`login:${handle}`);
    const result = await oauth.completeAuthorization({
      request: saved.auth,
      userId: signed.user.id,
      metadata: {},
      scope: saved.auth.scope,
      props: {
        userId: signed.user.id,
        upstreamToken: signed.token,
        scopes: saved.auth.scope,
      },
    });
    return new Response(null, {
      status: 302,
      headers: {
        Location: result.redirectTo,
        "Cache-Control": "no-store",
        "Set-Cookie": `__Host-sally-login-${loginHandle}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo)
      return Response.redirect(error.redirectTo, 302);
    if (stage === "email")
      return html(
        "<p>Sally could not send your sign-in email. This environment’s email delivery may be unavailable. Start again from ChatGPT after support confirms delivery is enabled, or contact peter@heysalad.ai.</p>",
        undefined,
        503,
      );
    return html(
      "<p>Sign-in could not be completed. Retry from your client or contact peter@heysalad.ai.</p>",
      undefined,
      400,
    );
  }
}
