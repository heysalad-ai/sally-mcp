import { ipAddress } from "@vercel/functions";
import { proxyRequest } from "../../../lib/proxy.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handle = (request) =>
  proxyRequest(
    request,
    {
      workerOrigin: process.env.SALLY_WORKER_ORIGIN,
      proxyKey: process.env.SALLY_PROXY_KEY,
    },
    fetch,
    ipAddress(request),
  );
export {
  handle as GET,
  handle as POST,
  handle as DELETE,
  handle as OPTIONS,
  handle as HEAD,
};
