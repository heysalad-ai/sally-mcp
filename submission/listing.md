# Sally by HeySalad® — app directory submission draft

Status: staging review pack. **Do not submit yet. Peter submits.**

- Name: Sally by HeySalad®
- Owner/developer: HeySalad Inc.
- Tagline: love your food
- Short description: Plan grocery lists and review product matches with Sally.
- Description: Sally by HeySalad® is HeySalad Inc.’s AI grocery assistant. Turn recipes into shopping lists, compare products supplied from Ocado, Waitrose, Tesco or Asda pages, and understand product choices. See observed prices, pack sizes, confidence and amber notes when quantities need a second look. Prepare a copyable shopping list and hand it to the Sally Chrome extension. You review your basket and always check out and pay yourself.
- Website: https://heysalad.ai/sally
- Privacy policy: https://heysalad.ai/sally/privacy — must be approved, published and verified before submission.
- Support: peter@heysalad.ai
- Source: https://github.com/Hey-Salad/sally-mcp
- Public beta MCP URL: https://mcp.heysalad.ai/mcp (dev API; email sign-in restricted to Peter; not directory-submitted)
- Transport: Streamable HTTP
- Authentication: mixed (anonymous matching plus OAuth 2.1 for account tools).
- OAuth scope: `sally:tools`; optional `offline_access`.
- OAuth discovery: /.well-known/oauth-authorization-server
- Protected resource discovery: /.well-known/oauth-protected-resource/mcp
- Code: AGPL-3.0-only. Widget fonts: SIL Open Font License (included).

## Model-facing behavior

Tool descriptions and schemas are served by MCP discovery. The plugin skill is `plugin/skills/sally/SKILL.md`. Sally accepts candidate products; she does not perform retailer catalogue search. `basket_link` prepares instructions only. No tool modifies a basket, checks out, orders groceries, or pays.

## Review scenarios

1. Anonymous no-candidate request: ask to match milk at Ocado without candidates. Expected: no invented product; amber instruction to get retailer-page candidates.
2. Anonymous supplied candidates: pass a real observed product card. Expected: API-confirmed or vetoed match, observed price, pack size, confidence or explicit unavailability, review note.
3. Sign in with the isolated review Sally account, convert a short recipe for four. Expected: normalised items and visible scaling note.
4. Explain a questionable product. Expected: API verdict and truthful shadow status; no claim Nano ran when unavailable.
5. Prepare basket handoff. Expected: retailer URL and copyable list; no basket modification or payment.
6. Wrong retailer URL, too many candidates, invalid input or exhausted anonymous quota: validation/error message without confidential details.

## Screenshots

Use the files in `screenshots/` and their captions in `screenshots/README.md`. Distinguish actual ChatGPT host screenshots from standalone UI previews and illustrative fixtures. Replace any preview image with a real host screenshot before public submission if required by review.

## Welcome copy

Hey! 👋 🥗

Welcome to Sally by HeySalad®! What are we cooking or shopping for today?

I can help you turn recipes into shopping lists, find matching groceries, or prepare a basket for Tesco, ASDA, Waitrose, or Ocado.

Developer: HeySalad Inc. Use the actual HeySalad mark in `plugin/assets/heysalad.svg` or the accompanying PNG. Select the verified HeySalad Inc. developer identity in OpenAI’s dashboard; the personal custom MCP connection can show its creator’s account name independently of package metadata.
