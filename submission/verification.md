# Verification ledger

Date: 15 October 2026, Europe/London. This is a staging delivery with explicit release blockers.

| Criterion                                                                         | Evidence                                                                                                                                                  | Status                                                                                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Four tool handlers, validation and failure paths                                  | `npm test`: 68 passing tests, including 25 Python-rules parity fixtures                                                                                   | Pass                                                                                                                    |
| Static checks and Worker build                                                    | `npm run typecheck`; `npm run build`                                                                                                                      | Pass                                                                                                                    |
| No committed secrets                                                              | `npm run secrets:check`; ignored mode-0600 local secrets; remote secrets installed through stdin                                                          | Pass for credential-pattern scan; not a guarantee of all possible secret formats                                        |
| MCP discovery/resources/tool calls                                                | `npm run smoke` locally and against staging                                                                                                               | Pass                                                                                                                    |
| Anonymous quota and usage                                                         | Hosted D1 rejects the fourth tool call; aggregate logs record tool/status counts                                                                          | Pass                                                                                                                    |
| Inspector                                                                         | Inspector CLI discovers all four tools locally and on staging                                                                                             | Pass                                                                                                                    |
| OAuth metadata, S256 PKCE, DCR, browser-bound consent and invalid-token rejection | Hosted smoke + auth unit tests                                                                                                                            | Pass for protocol/negative paths                                                                                        |
| Real Sally account OAuth sign-in                                                  | Peter entered his code privately; ChatGPT settings show linked Peter account and Authorization used: OAuth.                                               | Pass on 15 October 2026                                                                                                 |
| Live authoritative matching                                                       | Hosted synthetic-card acceptance (`milk 2 pints`) and veto (`bananas` → banana bread); actual dev API returns `decisions:gpt-6-luna`                      | Pass; fixture prices are not current retail quotes                                                                      |
| Recipe API integration                                                            | `npx tsx scripts/live-tools.ts`: live guest test session, tomato pasta → 200g pasta, 400g tomatoes, 1 onion                                               | Pass for backend route, not a full account OAuth journey                                                                |
| Full rules                                                                        | TypeScript port of Python reference at `783d766`; 25 parity fixtures                                                                                      | Pass on tested cases, shadow only                                                                                       |
| Sally-Nano inference                                                              | Private int8 checkpoint runs locally; 10 Python tests pass; original evaluation function parity on 25 cases (<1e-7 error)                                 | Local pass; private inference hosting still required                                                                    |
| Owning API shadow hook                                                            | Separate dev-only draft change, disabled by default; background evaluation, agreement log in `ai_usage_logs`                                              | Prepared in [draft PR #29](https://github.com/Hey-Salad/heysalad-payme/pull/29); 65 tests and bundle pass; not deployed |
| Product UI                                                                        | `npm run test:ui`: 5 passing browser tests covering desktop/mobile layout, images, price, size, confidence, amber notes, injection and message boundaries | Pass in local isolated Chromium                                                                                         |
| ChatGPT app connection                                                            | Registered work-account app `asdk_app_6ad0355b132081919e3630fdb0876700`; anonymous connection and actual ChatGPT tool call observed.                      | Pass for anonymous access; real-account OAuth pending Peter’s sign-in                                                   |
| ChatGPT in-chat tool and widget                                                   | Actual ChatGPT `match_products` call for synthetic empty candidates displayed branded iframe and amber review note.                                       | Pass for host delivery; CSP enforcement was off in developer settings; populated host product cards still unverified    |
| Codex config and actual tool call                                                 | `codex mcp list` accepts remote config; CLI 0.149.0 completed hosted `match_products` and returned amber no-candidate note                                | Pass for anonymous E2E                                                                                                  |
| Codex model prerequisite                                                          | CLI configured `gpt-6.1-sol` was rejected by its account endpoint; one-run test override `SALLY_TEST_MODEL=gpt-5.6-terra` passed                          | Environment limitation; no global model settings changed                                                                |
| Privacy URL                                                                       | Following https://heysalad.ai/sally/privacy redirects to login                                                                                            | Blocked: policy is not public                                                                                           |
| Review credentials                                                                | Instructions drafted; no isolated reviewer account/inbox provisioned                                                                                      | Blocked before submission                                                                                               |
| Submission                                                                        | Listing, privacy draft, test-access instructions, plugin package and labeled UI screenshots                                                               | Prepared for review, not ready to submit until blockers clear                                                           |
| Production rollout                                                                | `sally-api` and `shopping-agent` were not deployed                                                                                                        | Pending explicit approval/release work                                                                                  |

Additional isolated-runtime evidence (same Worker bundle, real provider/D1/KV, every upstream request intercepted): `npm run test:runtime` proves OAuth code exchange + S256 PKCE, all three protected tool calls, refresh rotation, revocation, pseudonymous usage, browser consent denial without an email, and retention cleanup during an upstream guest-renewal outage. No real email, account or credential is used. This strengthens protocol verification; real-account delivery and actual ChatGPT-host rendering remain unverified.

Two runtime defects were reproduced before fixing them: HTML required-email validation blocked Deny, and a failed renewal skipped expired-record deletion. Deny now bypasses email validation; cleanup and renewal settle independently, with maintenance failures still reported.

Staging MCP: https://sally-mcp-staging.heysalad-o.workers.dev/mcp

Health: https://sally-mcp-staging.heysalad-o.workers.dev/health

Current branded workspace package: https://chatgpt.com/plugins/Plugin_0db9bb06a52c81918be3bd5569a38e7a (imported; web MCP connection not yet registered). The former personal app was deleted; its URL is no longer usable.

A Workers-specific failure found during live matching was fixed: Workers rejects `redirect: "error"`; upstream requests now use `manual` and reject redirects without forwarding credentials. A regression test covers it. Routine discovery had passed before this live-call check caught the runtime problem.

The upstream Sally API has existing TypeScript diagnostics and dependency audit findings; its separate shadow PR documents baseline comparison and is not claimed fully green merely because its tests and bundle pass. No production merge/deployment or OpenAI directory submission occurred.

Current staging deployment version: `eb1544b5-b654-4847-a003-737d785ac220`. Hosted acceptance/veto run IDs: `5c0d320e-04df-4b11-aba7-dba164f88dfb`, `5d3f3d06-429f-48fe-99ed-12587daa1d2d`.

Backend privacy source cleanup is prepared in [draft PR #31](https://github.com/Hey-Salad/heysalad-payme/pull/31): 66 backend tests pass and the dev bundle passes. It remains unmerged/undeployed, with the same 126 baseline TypeScript diagnostics; historical-log and account/OTP-retention review is still required.

Explicit-serving contract: [draft backend PR #32](https://github.com/Hey-Salad/heysalad-payme/pull/32), 64 tests passing, remains undeployed. MCP now distinguishes requested from applied servings, displays an amber warning when the old API cannot confirm scaling, and refuses a known mismatch. Signed-in live serving scaling is a remaining release gate.

PR #27 (1.0.30an fixes) was verified already merged into main, with all three Sally release CI jobs green. No merge was performed by this work.

Private Nano inference: pinned model digest `c61eab67d1c8710f8ed01ab49d3ecb59d993ec68ed51cf42e797be3f326bc573`; original Python features vendored unchanged from `783d766`. Tokenizer and ID map stay private. CPU HTTP service prepared with authenticated request limits. Docker packaging is prepared but untested because Docker is unavailable on this host. Nano has not run in the hosted MCP/backend path, and benchmark gold metrics were not reproduced.

Retailer image fix: added exact verified Tesco, Waitrose and Asda image origins to the widget and MCP Apps CSP; storefront links remain separate. Five UI tests now cover image loading, lookalike-host rejection and broken-image placeholders. Source provenance is in [product-images](../docs/product-images.md).

Branding update: the actual ChatGPT private app name and description were saved and verified as Sally by HeySalad® / HeySalad Inc. on 15 October. Refreshed tools after deploying the branded MCP metadata and welcome instructions. The widget, consent page and plugin package now use the actual HeySalad mark (SVG and square PNG). The existing private app still displays its generic icon and creator Peter Machona: its settings expose no icon/developer edit. Package author/developerName are HeySalad Inc.; public directory attribution requires selecting the verified company developer identity. Category and website metadata are prepared in the package, not verified on that existing private listing.

Account migration (15 October 2026): at Peter’s explicit request and final irreversible-deletion confirmation, the personal ChatGPT development app `asdk_app_6ad0179a237881919b08328b5ccdc5a8` was deleted. ChatGPT returned to installed-plugin settings with Sally absent. The MCP Worker, repository and branded plugin package remain intact. ChatGPT Add account sign-in was opened for Peter; credentials are left to him. The previous private installation is no longer available, and a new HeySalad-account connection and host validation are required. The old account’s HeySalad Inc. workspace appeared deactivated; no billing/workspace changes were made.

Workspace migration progress (15 October 2026): signed-in account `peter@heysalad.ai`, active Heysalad Business workspace. Branded archive imported successfully as `Plugin_0db9bb06a52c81918be3bd5569a38e7a`: actual HeySalad icon, Sally by HeySalad® title, Productivity category, website and privacy metadata visible. ChatGPT still attributes the workspace creator as Peter Machona despite company metadata. Raw remote MCP package offers “Open in desktop app”; this does not prove a working ChatGPT web app.

Peter approved connecting the staging MCP with OAuth-or-anonymous access. Creation failed with “Custom apps aren't allowed in this context. Check your workspace permissions or security settings”. Workspace Apps points to the new Plugins administration site. That site returned an unexpected-response error, then a separate Cloudflare human verification after reload. No workspace permissions/security settings were changed.

A private workspace archive builder is prepared at `scripts/package-workspace.py`. After registering the actual MCP app, run `python3 scripts/package-workspace.py asdk_app_ACTUAL_ID`. It replaces raw MCP configuration with a required registered-app reference in `.app.json`, preserving the skill and brand. The generated `submission/sally-workspace-plugin.zip` is ignored and must not be submitted publicly. Update the existing workspace plugin rather than creating another copy. A registered ID and host validation remain required; a placeholder ID cannot create a working connection.

Workspace connection update (15 October): Peter approved enabling developer mode. The admin form then registered `asdk_app_6ad0355b132081919e3630fdb0876700`. Anonymous “Use without an account” connection succeeded. Actual ChatGPT conversation https://chatgpt.com/c/6ad035de-9840-83eb-a8ac-143309d01ccd called `match_products` with `milk 2 pints` and no candidates; Sally’s branded widget displayed the appropriate amber review note. Screenshot `screenshots/chatgpt-empty-candidates.png` is actual host proof using synthetic input, with CSP off in host developer settings. No products, prices or basket were invented.

The existing branded workspace wrapper was updated successfully to version 0.1.2 using the registered-app mapping. Admin details now show Apps → Sally by HeySalad® (Required) and the Sally skill, with no raw MCP-server section. It remains private. The developer byline is still Peter Machona despite company metadata. Workspace availability of the registered custom app remains disabled for general members; it works for the developer’s connection. No public submission or general-member enablement occurred.

OAuth browser regression: Peter reported “Origin not allowed” after sign-in. Replaying the actual consent response headers reproduced `Origin: null` on form submission because `Referrer-Policy: no-referrer` suppresses the header. Changed this to `same-origin`; browser regression now preserves the expected Origin, while forged origins remain rejected. The previous browser fixture had omitted response headers and missed the defect. `npm run check` (59 unit tests), five UI tests, and isolated OAuth runtime tests pass. Fix staged in Worker version `78b9e560-4cfc-4e8a-8226-584f9de23f69`; hosted MCP smoke and Inspector pass. Real email-code sign-in remains unverified until Peter completes it.

Requested domain: `https://heysalad.app/mcp` currently returns HTTP 301 to `https://heysalad.ai/`. The zone is active and its Worker routes have no MCP conflict. Available Cloudflare credentials cannot read DNS or redirect rules (HTTP 403). No DNS/redirect/production routing changes were made. See `../docs/custom-domain.md` for migration gates.

Latest staging version: `72978361-3531-4145-bf5d-87891853f7eb` also includes a layout correction making no-product review headings span the card width. Required checks remained green before this deployment.

15 October sign-in delivery diagnosis: Cloudflare’s deployed sally-api-dev settings confirm no EMAIL_SERVICE service binding. Its owning config deliberately disables real email in dev. Peter’s `/authorize/send` failure therefore did not verify email delivery. Prepared backend [PR #36](https://github.com/Hey-Salad/heysalad-payme/pull/36), based on the privacy fix, with exact dev recipient allowlist `peter@heysalad.ai`, before-storage rejection for absent binding/disallowed recipients, and sender-level guard. Seventy-two API tests and dev bundle pass; 126 baseline TypeScript diagnostics remain. Peter explicitly approved this restricted dev deployment; deployment/real inbox checks are recorded separately below.

MCP send-code failure now returns a clear HTTP 503 and no code-entry form, including when upstream returns HTTP 200 with success=false. Two regressions cover this behavior. MCP checks: 61 tests, five UI tests, and real isolated OAuth runtime pass. Staging version `1e63f7ee-774e-4288-b63d-91ddb8dbfe27` deployed with official full logo/wordmark from Peter’s `HeySalad-Logo-Black.svg`, copied unchanged. Consent and product UI previews were rendered and visually inspected. Hosted MCP smoke passes. The square app icon remains the official mark; the page headers now use the full lockup.

Real-account verification (15 October): Peter successfully returned to ChatGPT after entering his email code privately. Actual ChatGPT plugin settings show a linked account and “Authorization used: OAuth”. Through the connected Sally app, all three protected tools returned successful results: synthetic tomato-pasta recipe → 200g pasta, 400g tomatoes, 1 onion (serving count explicitly unconfirmed); synthetic whole-milk explanation → Luna Decisions match plus rules in shadow; Ocado basket handoff → checkout=false/payment=false. Nano remains unavailable remotely. No account password/code was read or entered by the agent.

Further browser defects were reproduced after delivery was enabled. Concurrent sign-ins shared one browser cookie, so one could invalidate another. Cookie names now include the validated login transaction UUID, and each successful sign-in clears only its own cookie. The consent page CSP also blocked the approved cross-origin return after form submission; form-action now permits only self plus the OAuth provider’s validated callback origin. A real-browser isolated test starts two overlapping sign-ins, submits synthetic codes, observes each validated callback navigation, and redeems each returned code with PKCE. These checks strengthen the earlier manual-cookie protocol test. An attempted callback-page rendering assertion was replaced with actual navigation plus code redemption because the synthetic external callback has no real web server; no OAuth assertion was relaxed. All checks passed for staging version `8705cc5d-a2b1-429f-a331-3744d094e63f`.

A protected-tool smoke also revealed duplicated quantities in free-text extension handoffs (`1 1 onion`). A regression reproduced it; free-text list lines are now preserved, while structured quantities still render explicitly. Final verification/deployment version follows below.

Current account checks: authenticated basket handoff now preserves free-text quantities exactly (`200g pasta`, `400g chopped tomatoes`, `1 onion`), with checkout/payment false. Hosted smoke and Inspector pass against staging version `ff09e869-c889-4b29-9bb1-21032a1c9215` (62 unit tests, five UI tests, overlapping browser OAuth test). Real ChatGPT populated-card smoke renders the explicitly labeled synthetic whole-milk fixture with £1.80, 2 pints, 100% reported model confidence, no-image placeholder and amber pack review note. This is fixture evidence, not current retailer pricing. Host CSP enforcement is still off.

ChatGPT cached the old widget artwork even after refreshing tools. Bumped the resource URI to `ui://sally/products-v2.html` and server metadata version to 0.1.2 so new tool definitions can retrieve the updated full-wordmark resource. Final host verification follows after that deployment.

Latest staged MCP deployment: `720df9ea-86cd-405a-bfbc-27d3738f15e2` (versioned widget URI and 0.1.2 server metadata). Required checks pass: 62 unit tests, five UI tests, isolated real-browser overlapping OAuth transactions, typecheck/build, format and secret scan.

Final host branding proof: after the widget URI change and completed tool refresh, actual ChatGPT UI renders `HeySalad logo` (full wordmark), Sally by HeySalad®, tagline and amber note. Opened the app in ChatGPT’s own tab view and visually inspected it. Evidence: `screenshots/chatgpt-wordmark-live.png` (synthetic no-candidate test). Real-account OAuth and protected tools pass. Code CI at c3d36ba is green (verify and nano-service); public directory submission has not occurred.

Vercel domain preparation (15 October): authoritative heysalad.ai DNS is Vercel; the apex/wildcard belong to heysalad-ai-platform. Created separate sally-mcp Vercel project and isolated sally-mcp-branded-preview Worker (D1/KV separate from working ChatGPT staging). Worker version 8e204709-5501-486a-a324-33acee69645d trusts only the authenticated streaming proxy and fixes PUBLIC_ORIGIN to the Preview origin. Direct Worker /mcp returns 404. No production hostname assignment or website change occurred. Vercel unexpectedly labelled its first failed deployment Production; it had no Production proxy variables and did not serve Sally. Subsequent deployment explicitly targets Preview.

Ready Preview: https://sally-3p0kan3w9-hey-salad-inc.vercel.app (dpl_4fLRCFdqhNBuo3Ak2iS2NwJoP7xJ). Vercel protection stays enabled; authenticated CLI curl ran the full SDK smoke via scripts/vercel-preview-smoke.mjs: initialize, four tool definitions, versioned widget resource, anonymous empty-candidate matching, protected-tool OAuth challenge, invalid-token/origin rejection, discovery resource/issuer, DCR, PKCE enforcement and consent cookie all PASS. Preview protection means this is not yet a ChatGPT account test at the new origin. Existing staging account proof above remains valid for its own issuer.

Local checks: 68 Worker tests, four proxy tests, five UI tests, direct and proxied real-browser OAuth lifecycle (including overlapping sign-ins, callback navigation, code redemption, refresh/revocation), typecheck, Worker dry build, Next build, format and secret scan PASS. Credentials remain only in ignored private files and cloud environment secrets. Production proxy variables remain unset. Proposed next step, requiring Peter's approval: publish only the separate Vercel project at mcp.heysalad.ai, set the isolated Worker's issuer to that origin, configure its Production proxy variables, then validate public HTTPS/MCP/OAuth. Existing apex/wildcard website and working staging account must remain intact. Public submission remains Peter's action.

Approved canonical domain deployment (15 October): Peter approved publishing the proxy and configuring its Production secrets/isolated issuer. Vercel project sally-mcp now owns only mcp.heysalad.ai; deployment dpl_DRcbCiVqTDbC25MdQ4idLx5uNpDT is Ready. Isolated Worker version 00a73c8a-b017-4892-bab2-c93ded3bd2b6 uses PUBLIC_ORIGIN=https://mcp.heysalad.ai. Public health HTTP 200, full SDK smoke and Inspector tools/list PASS over ordinary public HTTPS (no Vercel protection bypass). Real consent branding was visually inspected on the canonical origin. Existing apex/wildcard website assignments and working ChatGPT staging remain intact. Production Sally API was not deployed; beta email sign-in remains restricted to peter@heysalad.ai. Account OAuth in ChatGPT at the new issuer is not yet verified. Updated public Codex config/package to canonical URL; rebuilt archive checked for correct endpoint and absence of private workspace app mapping. Official plugin and MCP schemas pass. CI at 4e2b9ab is green for verify, nano-service and vercel-proxy.

Canonical live matcher validation: synthetic milk 2-pint candidate accepted by decisions:gpt-6-luna (run 93e9bb71-bc78-4c77-a5df-5abf7b7d3eef); synthetic banana bread candidate rejected for bananas (run 992f588a-1b64-4abe-99f9-0b1156b91995). Fixtures are not catalogue observations/current prices. Real Codex CLI 0.149.0 with one-run gpt-5.6-terra override completed canonical anonymous match_products (run 340613b2-63e3-47df-bfdc-6aeb36f2419f). Default gpt-6.1-sol remains rejected by this CLI account endpoint. Three scripted attempts returned no available Sally tool, including the shortened prompt; a direct CLI invocation did complete the call above. This remains a Codex tool-discovery/test reliability finding; the scripted Codex check is not green. No global Codex model/config changed. Live consent screenshot: screenshots/branded-domain-consent.png, synthetic client registration, no email/code entered.

OAuth styling revision (15 October): Peter requested the existing heysalad-payme OAuth look shown in his screenshot. Source inspected: heysalad-oauth/src/ui.ts at heysalad-payme main 3134f2e. Adapted its white centered card, soft shadow, rounded inputs, red primary button, helper text and separated footer in ui/auth.css. Preserved Sally by HeySalad®, official inline full wordmark, HeySalad Inc. footer, all consent/client/return-host/scope disclosures, script-free CSP and the existing browser-bound email-code flow. No magic-link/social authentication was added. All 68 unit tests, five existing UI tests, typecheck/build, direct and proxied complete OAuth/browser lifecycle pass. Browser checks assert desktop/mobile fit and aligned full-width fields/actions; screenshots oauth-style-*-fixture.png show isolated synthetic client data, not a live account. Production canonical styling deployment requires approval after the staging preview.

Styled staging deployed: 186f6f5a-5fc4-491e-91cd-907b4b7b203a. Hosted MCP smoke and Inspector four-tool discovery pass; real staging consent page opened and visually checked. No production canonical Worker change in this style revision.

Consent header refinement: removed the visible Sally by HeySalad® heading Peter boxed in his screenshot. The official HeySalad wordmark and love your food tagline remain; browser title and accessible main landmark still identify Sally. Browser assertions now require the duplicate heading to be absent, the wordmark/tagline to be present and form Figtree to load (the removed headline no longer uses Grandstander). Desktop/mobile layout and complete proxied OAuth lifecycle pass; 68 unit tests, build/typecheck and five UI tests pass. Updated synthetic preview screenshots. Canonical production styling remains pending the previously requested approval.

Header removal staged in Worker bf51a317-d233-48b6-a79b-733589675bb9; browser reload confirms only the wordmark and tagline in the header. No user email/code submitted.

Peter approved publishing the revised sign-in styling. Canonical Worker c1ff24e5-4754-4dbc-a362-4a665443cfd8 first published the card and heading removal. Follow-up copy review clarified the validated callback host: loopback now says “After signing in, you’ll return to the app on this device (127.0.0.1).”; non-loopback names the actual validated return host. No redirect/auth method/access change. Final canonical Worker 45ab6e40-564d-442c-8b15-3337162f7ec2 and staging 8e8e949e-6e5f-410d-a4c4-1fb4830cd71c contain that wording. Actual canonical browser view confirms wordmark/tagline, no duplicate heading, and the clearer loopback text (oauth-live-return-wording.png; synthetic registered client, no email/code submitted). 68 unit tests, typecheck/build, proxied complete OAuth/browser lifecycle, five UI tests, format and secrets checks pass. Prior styling approval is fulfilled; earlier pending styling entries are historical. Existing ChatGPT app still uses its original staging issuer.

Public-origin ChatGPT account verification (15 October): Peter completed the real ChatGPT OAuth flow on mcp.heysalad.ai, whose client is https://chatgpt.com/oauth/client.json and validated return is chatgpt.com/connector_platform_oauth_redirect. New developer app asdk_app_6ad04e7ade948191b45443bdb9f8ea74 is named Sally by HeySalad® — public beta to avoid the existing staging app name collision. ChatGPT settings visibly confirm Peter’s linked primary account, Authorization used: OAuth and https://mcp.heysalad.ai/mcp. No password or verification code was read/entered by the agent. Screenshot: screenshots/public-chatgpt-oauth-connected.png. All four tools succeeded through the newly connected public-beta connector: recipe conversion returned the sample ingredients with serving count explicitly unconfirmed; explanation rejected synthetic banana bread for bananas using Luna Decisions and shadow rules, Nano unavailable; basket handoff preserved quantities with checkout/payment false; empty-candidate matching returned an amber note (run 9e50942e-7fb4-4c71-b38c-c92ef9551e91). Fixture product price is not a live catalogue quote.

Actual ChatGPT conversation https://chatgpt.com/c/6ad050d2-58dc-83ed-892f-06e949c0cd20 called the new public app and rendered the official HeySalad wordmark, Sally title, Ocado and no-candidate amber card. Host CSP enforcement remains off; its control is an account-wide custom-app security setting and was inspected without changing it. Publisher byline still reads Peter Machona. Existing staging connection retained. Prepared ignored private workspace ZIP now references the public-origin app; public directory ZIP still uses the portable remote MCP URL, with no workspace app mapping. No directory submission occurred.

## Launch billing preparation — 15 October 2026

Peter confirmed Airwallex for paid plans and Free 10 / Pro 100 / Max unlimited
monthly shopping requests. [Backend draft PR #38](https://github.com/Hey-Salad/heysalad-payme/pull/38)
prepares authenticated, D1-atomic allowance enforcement and closes forged identity,
unconfigured admin and legacy webhook access. Includes the pending explicit
servings and dev rules/Nano shadow changes. 102 backend tests pass with actual
D1 concurrency and signed HTTP webhook tests; dev bundle passes. Backend
typecheck retains 118 existing diagnostics; it is not green. Not deployed.

The current draft meters each backend AI operation. A multi-product list can
consume multiple operations; Peter was asked to confirm whether one submitted
list should be the unit instead. This decision and its tests block activation.
No Sally Airwallex prices or trusted customer mapping are configured; paid
upgrades remain blocked. Existing restaurant Host prices are not Sally prices.
No charges, price changes, live billing migration or allowance activation occurred.

MCP maps upstream 402 to SALLY_ALLOWANCE_EXHAUSTED, 403 to access denied and
429 to rate limiting without exposing provider bodies (five regression cases).
Local `npm run check`: 73 tests, types, bundle and credential scan pass.
`npm run test:ui`: five browser tests pass. Hosted public smoke and Inspector
pass against https://mcp.heysalad.ai/mcp; these exercise the existing deployment,
not the unapproved billing backend. Codex 0.149.0 actual anonymous public MCP
call passed with required startup and gpt-5.6-terra. Earlier intermittent
runs ended without a tool call; diagnostics are now saved privately on that
failure. Do not call the intermittent behaviour resolved.

[Website draft PR #106](https://github.com/Hey-Salad/heysalad-ai/pull/106)
extends public privacy for ChatGPT/Codex/Vercel and intended Airwallex processing,
and hardens existing webhook policy. Node 24 production build, TypeScript,
targeted ESLint and 12 tests pass. Local production HTTP 200 and screenshot
checked. PR #105's existing historical-credential security gate remains; neither
website PR was merged or deployed to production. An automatic Vercel preview
for PR #106 completed at https://heysalad-ai-platform-7iw4suov8-hey-salad-inc.vercel.app;
anonymous privacy access returns HTTP 302 to Vercel SSO. Preview protection
was not disabled. Current public privacy URL still needs
anonymous hosted verification after an approved release.

Nano hosting remains unprovisioned. System Python has no Modal CLI; no new
compute, paid service or inference endpoint was deployed. Account-wide ChatGPT
CSP enforcement, verified HeySalad Inc. publisher identity, general signup/reviewer
access and production Sally API release remain separate launch gates.

## Product-card heading cleanup — prepared 15 October 2026

Removed the duplicate visible Sally by HeySalad® heading requested in Peter's
13:49 screenshot. Official wordmark, tagline and document title remain. Five
UI tests pass, including absence of the heading, visible logo/tagline and mobile
overflow checks. Screenshots products-desktop.png and products-mobile.png are
local illustrative fixtures. `npm run check` passed with 73 unit tests before
the separate list-metering changes. Public deployment approval is pending;
this entry does not claim the existing ChatGPT card has refreshed.

## Submitted-list billing revision — prepared 15 October 2026

Peter confirmed one submitted list counts once. This supersedes the earlier
per-operation draft and its open-unit gate. Backend PR #38 now has 109 passing
tests: twenty items count once; 20 concurrent retries count once at the last
Free slot; a new submission counts again; list/account mismatch, expiry and
request safety bounds fail before AI. A real authenticated HTTP submission
and retry also pass. Both migrations are rehearsed against real isolated D1.
Backend retains its 118 baseline type diagnostics; dry dev bundle passes.

MCP 79 tests, types, bundle and secret scan pass. New tests cover one admission
for multiple candidates, retry IDs, quota rejection before checks, explanation
reference reuse, and recipe conversion without a shopping-list charge.
`SALLY_LIST_BILLING` remains unset; this code is not enabled live. Five UI tests
pass separately. The Chrome extension must implement the list admission/header
contract before the shared API guard is enabled. Sally Airwallex prices, trusted
customer linkage and signed sandbox delivery remain unverified. No live
migration, billing activation or charge occurred.

Product-card cleanup deployed to legacy staging only from isolated UI commit
0ca13c4, version 08615069-303d-49b2-ba1b-fc4ed2f8da3b. Hosted smoke/Inspector
and actual widget-resource assertions pass: duplicate heading absent, official
logo/tagline retained. Public-domain publication approval is still pending.
List-metering code was excluded from that staging release.

Updated MCP source passes isolated workerd OAuth runtime tests with real PKCE
redemption, refresh rotation/revocation, overlapping browser sign-ins and
retention checks. Portable plugin package 0.1.2 rebuilt with the updated retry
instructions; private workspace package is prepared separately, not uploaded.

## Approved public product-card cleanup — deployed 15 October 2026

Peter explicitly approved publishing the card cleanup with billing disabled.
Deployed the previously tested UI release `0ca13c4` from its isolated archive,
not the later list-metering branch head. Public Worker
`sally-mcp-branded-preview` version
`6eda60e6-7077-44fa-8f59-3b085ee310b7` now serves through
https://mcp.heysalad.ai/mcp . Existing staging cleanup is unchanged.

Public SDK smoke and MCP Inspector pass. Reading the actual served
`ui://sally/products-v2.html` confirms the duplicate visible Sally heading is
absent and the official wordmark, tagline and document title remain. Four tools
remain; unreleased list-billing inputs are absent from deployed tool discovery.
Billing code/configuration, API migrations and paid plans were not activated.

`public-card-cleanup-render-fixture.png` is an isolated browser render of the
actual public resource with synthetic milk/no-candidate data. It was visually
checked; it is not a new ChatGPT-host screenshot. Previously rendered chat cards
were not edited, deleted or regenerated by this deployment.
