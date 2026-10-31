import { isIP } from "node:net";

const requestHeaders = [
  "accept",
  "authorization",
  "content-type",
  "cookie",
  "origin",
  "mcp-protocol-version",
  "mcp-session-id",
  "last-event-id",
];
const allowedPath = (path) =>
  path === "/" ||
  path === "/health" ||
  path === "/mcp" ||
  path.startsWith("/.well-known/") ||
  path === "/authorize" ||
  path.startsWith("/authorize/") ||
  path.startsWith("/oauth/") ||
  path.startsWith("/brand/");

export async function proxyRequest(
  request,
  configuration,
  fetcher = fetch,
  clientIp,
) {
  if (!allowedPath(new URL(request.url).pathname))
    return new Response("Not found", { status: 404 });
  const { workerOrigin, proxyKey } = configuration;
  if (!workerOrigin || !proxyKey || proxyKey.length < 32)
    return new Response("Sally connection is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  const base = new URL(workerOrigin);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    return new Response("Sally connection is not configured.", { status: 503 });
  const incoming = new URL(request.url);
  // Construct from a fixed configured origin; never let a path or forwarded host select a destination.
  const destination = new URL(base.origin);
  destination.pathname = incoming.pathname;
  destination.search = incoming.search;
  const headers = new Headers();
  for (const name of requestHeaders)
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  headers.set("x-sally-proxy-key", proxyKey);
  if (clientIp && isIP(clientIp)) headers.set("x-sally-client-ip", clientIp);
  headers.set("accept-encoding", "identity");
  try {
    const upstream = await fetcher(destination, {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store",
      ...(request.method === "GET" || request.method === "HEAD"
        ? {}
        : { body: request.body, duplex: "half" }),
      signal: request.signal,
    });
    // Preserve each Set-Cookie independently. Do not buffer the Streamable HTTP body.
    const responseHeaders = new Headers(upstream.headers);
    const cookies = upstream.headers.getSetCookie();
    responseHeaders.delete("set-cookie");
    for (const cookie of cookies) responseHeaders.append("set-cookie", cookie);
    for (const name of [
      "content-length",
      "content-encoding",
      "connection",
      "keep-alive",
      "transfer-encoding",
      "x-sally-proxy-key",
    ])
      responseHeaders.delete(name);
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("Vercel-CDN-Cache-Control", "no-store");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response("Sally is temporarily unavailable.", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
