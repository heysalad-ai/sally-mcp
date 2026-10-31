# Backend contract and release boundaries

Inspected 15 October 2026 (Europe/London).

The MCP staging Worker points at `https://sally-api-dev.heysalad-o.workers.dev`. Production `sally-api` and `shopping-agent` were not deployed by this work.

Source inspected: Hey-Salad/heysalad-payme, `dev/sally-api-dev-integration`, commit `0b919ad5c2788d364acf5e10a95037881f0cdc08`; `sally-api/src/routes/extension.ts`, `sally-api/src/services/sense-check.ts`, and `docs/sally/logging.md`. The earlier stack includes PR #21 on `cursor/sally-1030-tiered-agentic`. The caller-supplied `/api/match-product` description does not match the integration branch’s current Sally API source: the traced sense check is `POST /api/extension/ai/sense-check`.

- Per-candidate: `line`, `chosen` product card, `candidates`, `runId`, `itemIndex` → `verdict: confirm|veto`, `reason`, `confidence` (nullable), `model`, `fallback`.
- The backend’s chain is Luna Decisions → Sol Responses → Luna Responses. MCP never calls OpenAI directly or carries an OpenAI key.
- `POST /api/ai/generate-list` receives `{input,servings}` and returns `{items}`. Its source can prefer saved household size over requested servings. MCP returns `requested_servings` and `applied_servings` separately; older responses leave the latter null with an amber note, and a known mismatch is rejected.
- `POST /api/auth/send-email-otp` and `/verify-email-otp` implement the account sign-in step. MCP OAuth is separate and uses resource-bound provider tokens.
- `POST /api/auth/guest-session` supplies anonymous upstream access. This is a necessary backend guest account, not a user account impersonation. The initial guest credential is a Worker secret; daily renewal stores a short-lived guest credential in KV.
- There is no catalogue search API: candidates come from retailer-page selectors or the user. The MCP server does not scrape retailer pages.
- `basket_link` does not call legacy autonomous-shopping, checkout, or payment endpoints. It returns only a retailer URL and instructions.

The backend debug API is not exposed as an MCP tool. Run IDs are generated per call and can be inspected by an authorised backend operator using `docs/sally/logging.md`; MCP D1 logs contain no grocery text.

## Rules and Sally-Nano

Reference: `sally-model/phase-1`, report at commit `783d766`, `sally-model/overnight/REPORT.md`. The winning checkpoint is `s5-nano1x64-mf12-s0` int8. The repository describes the checkpoint but does not contain trained weights.

The current MCP layer runs a **TypeScript port** of the Python rules as a shadow check. Parity is tested against 25 fixtures generated from the Python reference, including size/unit, multipack, type/form and preference flags. `NANO_SHADOW_URL` optionally enables `/predict` on a dedicated HTTPS inference service, requiring `{probability,model,sha256}` and the matching pinned `NANO_SHADOW_SHA256`. Optional `NANO_SHADOW_TOKEN` stays in Worker secrets. Nano errors never alter the authoritative API verdict, and unavailable/error status is returned explicitly.

Prepared owning-API change: [draft PR #29](https://github.com/Hey-Salad/heysalad-payme/pull/29), disabled by default and not deployed.

The owner supplied the local private int8 artifact and tokenizer/ID map on 15 October. Weights remain outside this public repository. The [private-artifact CPU service](../inference/README.md) now uses the unchanged Python feature modules, verifies all five artifact hashes, and runs the actual int8 checkpoint locally. Ten local tests cover real inference/HTTP, feature feed, authentication, limits and digest rejection. Predictions match the original `eval_ladder.py` function across 25 parity cases (maximum absolute probability error below 1e-7). No weights or tokenizer data are copied into this repository. Pending: host that service privately; merge and validate the prepared dev-only rules + Nano shadow hook in the owning Sally API, then enable its flag and log agreement in its existing `ai_usage_logs`. The optional MCP shadow adapter alone does **not** complete that backend task. Do not promote shadow verdicts into decisions or claim benchmark figures establish live correctness.

## Public-launch blockers

Before a production rollout, review the owning Sally API’s existing OTP/debug logging and retention. The source inspected includes code/email debug logging in the OTP route and line/product observability in dev sense checks; the new MCP D1 does not retain those payloads. Reconcile those policies and code before publishing a privacy policy that describes the whole service.

Prepared privacy cleanup: [draft PR #31](https://github.com/Hey-Salad/heysalad-payme/pull/31) removes OTP/recipient/provider-error payload logging and strips grocery text from sense-verdict persistence while preserving run attribution. Its 66 tests and dev bundle pass; it is not deployed and does not purge historical logs or resolve account/OTP retention.

Prepared explicit-servings fix: [draft PR #32](https://github.com/Hey-Salad/heysalad-payme/pull/32) lets an explicit request override the saved household size and returns the applied count. Four regression scenarios and the full 64-test backend suite pass. It is not deployed; current live scaling remains unconfirmed.

## Membership launch preparation

Peter selected Free 10 / Pro 100 / Max unlimited monthly shopping requests,
with Airwallex for paid plans. [Draft PR #38](https://github.com/Hey-Salad/heysalad-payme/pull/38)
prepares authoritative D1 allowances and signed subscription handling, built on
restricted dev email deployment PR #36. It includes pending PR #32 servings and
PR #29 dev-only shadow hooks. It is not deployed. Current metering is per backend
AI operation and must be reconciled with the submitted-list boundary before
activation. Sally price/customer mappings and paid upgrade flow remain unverified.
MCP preserves quota/access errors; rate limiting alone does not enforce billing.

## Submitted-list metering decision — 15 October 2026

Peter confirmed one submitted shopping list counts as one request. PR #38 now
admits the complete list through `/api/billing/shopping-requests` and returns
an account/list-bound `shopping_request_id` for candidate checks and final sweeps.
Atomic D1 insertion and charging prevent double counts on concurrent retries.
MCP's `SALLY_LIST_BILLING=1` enables its client; currently unset. The shared API
guard must not be activated before the extension adopts the same protocol.
Recipe conversion and manual basket handoff do not submit a shop. Standalone
explanations submit one item; explanations with a prior request reference reuse
the original allowance. Batches retain the full list and `submission_id`.
