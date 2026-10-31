// Run with: node --import tsx scripts/vercel-preview-smoke.mjs <preview-origin>
// The authenticated Vercel CLI supplies deployment protection without exposing its token.
import { execFileSync } from "node:child_process";
const origin = new URL(process.argv[2]).origin;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== origin) return nativeFetch(request);
  const args = [
    "curl",
    url.pathname + url.search,
    "--deployment",
    origin,
    "--scope",
    "hey-salad-inc",
    "--",
    "--silent",
    "--show-error",
    "--include",
    "--max-time",
    "30",
    "--request",
    request.method,
  ];
  for (const [key, value] of request.headers)
    args.push("--header", `${key}: ${value}`);
  const body = request.body
    ? Buffer.from(await request.arrayBuffer())
    : undefined;
  if (body) args.push("--data-binary", "@-");
  const raw = execFileSync(process.env.VERCEL_CLI || "vercel", args, {
    cwd: new URL("../vercel-proxy/", import.meta.url),
    input: body,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 45000,
  }).toString();
  const boundary = raw.indexOf("\r\n\r\n");
  if (boundary < 0) throw new Error("Missing Vercel response headers");
  const lines = raw.slice(0, boundary).split("\r\n");
  const status = Number(lines.shift().split(" ")[1]);
  const headers = new Headers();
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon > 0)
      headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return new Response(
    [204, 205, 304].includes(status) ? null : raw.slice(boundary + 4),
    { status, headers },
  );
};
await import("./smoke.ts");
