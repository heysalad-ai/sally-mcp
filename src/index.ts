import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import type { Env, Identity } from "./types";
import { authorize } from "./auth";
import { canonicalProxyRequest } from "./proxy";
import { upstream } from "./upstream";
import { z } from "zod";
import { handleMcp } from "./server";
import { HEYSALAD_MARK_SVG } from "./brand";
const origins = new Set([
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://platform.openai.com",
  "http://localhost:6274",
  "http://127.0.0.1:6274",
]);
function provider(env: Env) {
  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: {
      fetch(req, env, ctx) {
        return handleMcp(
          req,
          env,
          (ctx as unknown as { props: Identity }).props,
        );
      },
    },
    defaultHandler: {
      fetch(req, env) {
        return authorize(req, env);
      },
    },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["sally:tools", "offline_access"],
    requiredScopes: ["sally:tools"],
    resourceMetadata: {
      resource: `${env.PUBLIC_ORIGIN}/mcp`,
      authorization_servers: [env.PUBLIC_ORIGIN],
      resource_name: "Sally",
    },
    clientIdMetadataDocumentEnabled: true,
    accessTokenTTL: 3600,
    refreshTokenTTL: 86400,
  });
}
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const canonical = canonicalProxyRequest(req, env);
    if (canonical instanceof Response) return canonical;
    req = canonical;
    const url = new URL(req.url);
    const origin = req.headers.get("Origin");
    if (origin && !origins.has(origin) && origin !== env.PUBLIC_ORIGIN)
      return new Response("Origin not allowed", { status: 403 });
    if (req.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin ?? env.PUBLIC_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id",
          "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Session-Id",
          Vary: "Origin",
        },
      });
    let response: Response;
    try {
      if (url.pathname === "/brand/heysalad.svg")
        response = new Response(HEYSALAD_MARK_SVG, {
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      else if (url.pathname === "/health")
        response = Response.json({
          service: "Sally MCP",
          owner: "HeySalad Inc.",
          environment: "staging",
          upstream: env.SALLY_API_URL,
        });
      else if (url.pathname === "/mcp" && !req.headers.has("Authorization"))
        response = await handleMcp(req, env);
      else if (
        url.pathname === "/mcp" ||
        url.pathname.startsWith("/.well-known/") ||
        url.pathname.startsWith("/oauth/") ||
        url.pathname.startsWith("/authorize")
      )
        response = await provider(env).fetch(req, env, ctx);
      else
        response = new Response(
          "Sally — love your food. Source: https://github.com/Hey-Salad/sally-mcp",
          { status: url.pathname === "/" ? 200 : 404 },
        );
    } catch {
      response = Response.json(
        { error: "Sally is temporarily unavailable." },
        { status: 503 },
      );
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    if (origin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set(
        "Access-Control-Expose-Headers",
        "WWW-Authenticate, MCP-Session-Id",
      );
      headers.set("Vary", "Origin");
    }
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_event: ScheduledEvent, env: Env) {
    const outcomes = await Promise.allSettled([
      (async () => {
        const guest = z
          .object({ data: z.object({ token: z.string().min(20) }) })
          .parse(await upstream(env, "/api/auth/guest-session", {}));
        await env.OAUTH_KV.put("guest:upstream", guest.data.token, {
          expirationTtl: 47 * 3600,
        });
      })(),
      env.DB.batch([
        env.DB.prepare("DELETE FROM usage_logs WHERE created_at < ?").bind(
          Math.floor(Date.now() / 1000) - 30 * 86400,
        ),
        env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(
          Math.floor(Date.now() / 1000),
        ),
      ]),
    ]);
    const failures = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );
    if (failures.length)
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        "Sally scheduled maintenance failed",
      );
  },
};
