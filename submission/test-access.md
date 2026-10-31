# Reviewer test access

Anonymous matching is available at the staging MCP URL. No credentials are needed for `match_products`; provide observed retailer-page candidates. Without candidates Sally returns a review note, not invented prices or products.

For account tools, Peter must provision an isolated Sally review account and a reviewer-accessible email inbox. The reviewer selects Sign in with Sally, enters that account’s email, receives a six-digit code and enters it themselves. Do not use Peter’s personal account, commit codes, share production credentials, or place secrets in a submission ZIP.

No usable review credentials have been created or distributed by this repository. Before submission Peter must test the complete review login, provide its instructions through OpenAI’s private review fields, and ensure it requires no additional owner intervention. If email-code delivery cannot meet that requirement, implement a dedicated secure demo sign-in path and test it before submitting. Do not bypass OAuth or introduce a public static bearer token.

Manual host validation:

1. In ChatGPT Plugins, Add → Add custom MCP server.
2. Name Sally, staging MCP URL, authentication “OAuth or no authentication”.
3. Choose Use without an account to validate anonymous matching; connect a review Sally account for the three protected tools.
4. Confirm the four tools and render the product cards and amber notes in a chat.
5. For Codex, use the README config, then `codex mcp login sally` and enter the code personally.

Submission is not authorised for the agent. Peter submits after the verification ledger’s blockers are resolved.

Current ChatGPT setup uses Plugins → + → Add custom MCP server; the current official flow does not require a separate developer-mode toggle. If the direct private-plugin URL downloads an extensionless file, use the Plugins interface instead. Installation alone does not prove an in-chat tool/widget or account login works.
