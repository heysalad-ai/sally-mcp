# Sally’s Vercel front door

Owner: HeySalad Inc. This separate project serves Sally on a Vercel-managed subdomain while Cloudflare keeps the MCP implementation, OAuth grants, D1 quota/usage and private guest session. It does not change the existing HeySalad website.

`app/.well-known/` contains real dynamic route handlers; no reserved discovery paths are implemented as external rewrites. All allowed routes stream to a fixed configured Worker origin. Redirects are passed to the browser, never followed with account credentials. Responses are not cached. Multiple Set-Cookie fields stay separate.

Set `SALLY_WORKER_ORIGIN` as Config and `SALLY_PROXY_KEY` as a Secret in the intended Vercel environment. Never put the secret in Git, a command argument, a client bundle or a URL. The corresponding isolated Worker must use `PROXY_ONLY=true`, the same secret in `PROXY_SHARED_SECRET`, and PUBLIC_ORIGIN set to the actual public Vercel origin. It rewrites the request URL from this fixed configuration, not a caller-supplied Host. Only authenticated proxy traffic can supply the authoritative Vercel client IP used for anonymous quotas; ordinary staging ignores forwarded identity.

Use explicit `--target preview` for tests. Vercel can assign a brand-new project’s first deployment to production automatically even without `--prod`; keep Production variables unset until the public cutover is approved. The explicit `framework: nextjs` avoids the generic static-site output-directory preset.

Tests: `npm ci && npm test && npm run build` here; `npm run test:runtime:proxy` from the repo root runs the real Worker OAuth/PKCE lifecycle and overlapping browser sign-ins through this exact proxy module. `npm run test:runtime` retains the direct-Worker regression checks.

After the hosted Preview passes and Peter approves: configure the Production variables, set the isolated Worker’s PUBLIC_ORIGIN to `https://mcp.heysalad.ai`, deploy this dedicated Vercel project and assign only that exact hostname. Keep the existing apex and wildcard website assignments. Validate HTTPS, discovery issuer/resource, anonymous matching, protected-tool challenges, real account sign-in, streaming and cookies before changing public install instructions or directory submission metadata. Do not migrate existing OAuth grants between issuers.
