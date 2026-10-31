import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Env } from "./types";

// Only the separate Vercel deployment enables this mode. Ordinary staging
// requests never trust forwarded identity or host headers.
export function canonicalProxyRequest(
  request: Request,
  env: Env,
): Request | Response {
  if (env.PROXY_ONLY !== "true") return request;
  const expected = new TextEncoder().encode(env.PROXY_SHARED_SECRET ?? "");
  const supplied = new TextEncoder().encode(
    request.headers.get("x-sally-proxy-key") ?? "",
  );
  if (expected.length < 32)
    return new Response("Sally proxy is not configured.", { status: 503 });
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return new Response("Not found", { status: 404 });
  const canonical = new URL(env.PUBLIC_ORIGIN);
  if (
    canonical.protocol !== "https:" ||
    canonical.pathname !== "/" ||
    canonical.username ||
    canonical.password ||
    canonical.search ||
    canonical.hash
  )
    return new Response("Sally proxy is not configured.", { status: 503 });
  const incoming = new URL(request.url);
  canonical.pathname = incoming.pathname;
  canonical.search = incoming.search;
  const headers = new Headers(request.headers);
  const clientIp = headers.get("x-sally-client-ip");
  headers.delete("x-sally-proxy-key");
  headers.delete("x-sally-client-ip");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");
  headers.delete("forwarded");
  headers.delete("cf-connecting-ip");
  if (clientIp && isIP(clientIp)) headers.set("cf-connecting-ip", clientIp);
  return new Request(new Request(canonical, request), { headers });
}
