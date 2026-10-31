import { it, expect } from "vitest";
import { canonicalProxyRequest } from "../src/proxy";
import type { Env } from "../src/types";
const key = "synthetic-proxy-test-".repeat(3);
const env = {
  PUBLIC_ORIGIN: "https://mcp.heysalad.example",
  PROXY_ONLY: "true",
  PROXY_SHARED_SECRET: key,
} as Env;
it("ignores forwarded identity on ordinary staging", () => {
  const request = new Request("https://stage.example/mcp", {
    headers: {
      "x-sally-client-ip": "198.51.100.1",
      "cf-connecting-ip": "198.51.100.2",
      "x-forwarded-host": "evil.example",
    },
  });
  const result = canonicalProxyRequest(request, {
    ...env,
    PROXY_ONLY: undefined,
  }) as Request;
  expect(result).toBe(request);
  expect(result.headers.get("cf-connecting-ip")).toBe("198.51.100.2");
});
it.each([undefined, "wrong", key + "x"])(
  "rejects a direct request without the private proxy key",
  (supplied) => {
    const result = canonicalProxyRequest(
      new Request("https://worker.example/mcp", {
        headers: supplied ? { "x-sally-proxy-key": supplied } : {},
      }),
      env,
    ) as Response;
    expect(result.status).toBe(404);
  },
);
it("fails closed if proxy trust has no key", () => {
  const result = canonicalProxyRequest(new Request("https://worker.example/"), {
    ...env,
    PROXY_SHARED_SECRET: undefined,
  }) as Response;
  expect(result.status).toBe(503);
});
it("preserves the body and canonical issuer without trusting forwarded host", async () => {
  const request = new Request("https://worker.example/oauth/token?test=1", {
    method: "POST",
    body: "synthetic-token-form",
    headers: {
      "x-sally-proxy-key": key,
      "x-sally-client-ip": "198.51.100.42",
      "x-forwarded-host": "evil.example",
      "cf-connecting-ip": "203.0.113.1",
    },
  });
  const result = canonicalProxyRequest(request, env) as Request;
  expect(result.url).toBe("https://mcp.heysalad.example/oauth/token?test=1");
  expect(await result.text()).toBe("synthetic-token-form");
  expect(result.headers.get("cf-connecting-ip")).toBe("198.51.100.42");
  expect(result.headers.has("x-sally-proxy-key")).toBe(false);
  expect(result.headers.has("x-forwarded-host")).toBe(false);
});
