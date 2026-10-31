import { test } from "node:test";
import assert from "node:assert/strict";
import { proxyRequest } from "../lib/proxy.mjs";
const config = {
  workerOrigin: "https://worker.example",
  proxyKey: "synthetic-private-proxy-key-for-tests",
};
test("proxies MCP and discovery to the fixed Worker, preserving headers and stream", async () => {
  for (const path of [
    "/mcp",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource/mcp",
  ]) {
    const response = await proxyRequest(
      new Request("https://mcp.example" + path, {
        headers: {
          authorization: "synthetic-account-token",
          "x-sally-proxy-key": "forged",
          "x-sally-client-ip": "203.0.113.1",
          "x-forwarded-host": "evil.example",
        },
      }),
      config,
      async (url, init) => {
        assert.equal(url.origin, "https://worker.example");
        assert.equal(url.pathname, path);
        assert.equal(init.redirect, "manual");
        assert.equal(
          init.headers.get("authorization"),
          "synthetic-account-token",
        );
        assert.equal(init.headers.get("x-sally-proxy-key"), config.proxyKey);
        assert.equal(init.headers.get("x-sally-client-ip"), "198.51.100.42");
        assert.equal(init.headers.has("x-forwarded-host"), false);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("data: fixture\n\n"));
              controller.close();
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
      "198.51.100.42",
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "data: fixture\n\n");
  }
});
test("preserves POST body, cookies, OAuth redirect and multiple Set-Cookie fields", async () => {
  const response = await proxyRequest(
    new Request("https://mcp.example/authorize/complete", {
      method: "POST",
      headers: {
        origin: "https://mcp.example",
        cookie: "synthetic-browser-binding",
      },
      body: "synthetic-form",
    }),
    config,
    async (_, init) => {
      assert.equal(await new Response(init.body).text(), "synthetic-form");
      assert.equal(init.headers.get("origin"), "https://mcp.example");
      assert.equal(init.headers.get("cookie"), "synthetic-browser-binding");
      const headers = new Headers({
        location: "https://chatgpt.example/callback",
        "content-encoding": "gzip",
        "content-length": "100",
      });
      headers.append("set-cookie", "first=fixture; Secure; HttpOnly");
      headers.append("set-cookie", "second=fixture; Secure; HttpOnly");
      return new Response(null, { status: 302, headers });
    },
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://chatgpt.example/callback",
  );
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(response.headers.has("content-encoding"), false);
  assert.equal(response.headers.has("content-length"), false);
});
test("rejects unknown paths and missing configuration without network requests", async () => {
  const fail = () => {
    throw Error("must not fetch");
  };
  assert.equal(
    (
      await proxyRequest(
        new Request("https://mcp.example/private"),
        config,
        fail,
      )
    ).status,
    404,
  );
  assert.equal(
    (await proxyRequest(new Request("https://mcp.example/mcp"), {}, fail))
      .status,
    503,
  );
  assert.equal(
    (
      await proxyRequest(
        new Request("https://mcp.example/mcp"),
        { ...config, workerOrigin: "http://worker.example" },
        fail,
      )
    ).status,
    503,
  );
});
test("does not reveal upstream failures or caller-supplied IP values", async () => {
  const result = await proxyRequest(
    new Request("https://mcp.example/mcp", {
      headers: { "x-sally-client-ip": "203.0.113.1" },
    }),
    config,
    async (_, init) => {
      assert.equal(init.headers.has("x-sally-client-ip"), false);
      throw Error("private provider detail");
    },
  );
  assert.equal(result.status, 502);
  assert.equal(
    (await result.text()).includes("private provider detail"),
    false,
  );
});
