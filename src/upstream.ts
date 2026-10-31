import type { Env } from "./types";
export class ToolError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function upstream(
  env: Env,
  path: string,
  body: unknown,
  token?: string,
  base = env.SALLY_API_URL,
  shoppingRequestId?: string,
): Promise<unknown> {
  const url = new URL(path, base);
  if (url.protocol !== "https:")
    throw new ToolError("CONFIGURATION", "The Sally upstream must use HTTPS.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(shoppingRequestId
        ? { "X-Sally-Shopping-Request": shoppingRequestId }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 402)
    throw new ToolError(
      "SALLY_ALLOWANCE_EXHAUSTED",
      "Your monthly Sally shopping-list allowance is exhausted. Review your Sally membership before submitting another shopping list.",
    );
  if (response.status === 409 || response.status === 428)
    throw new ToolError(
      "SHOPPING_REQUEST_UNAVAILABLE",
      "This shopping request cannot continue. Review its submission ID and list before starting another request.",
    );
  if (response.status === 429)
    throw new ToolError(
      "RATE_LIMITED",
      "Sally is receiving too many requests. Please try again later.",
    );
  if (response.status === 403)
    throw new ToolError(
      "SALLY_ACCESS_DENIED",
      "This Sally account does not have access to this operation.",
    );
  if (!response.ok)
    throw new ToolError(
      response.status === 401
        ? "SALLY_SIGN_IN_REQUIRED"
        : "UPSTREAM_UNAVAILABLE",
      `Sally API request failed (${response.status}). Please retry or reconnect your Sally account.`,
    );
  const text = await response.text();
  if (text.length > 500000)
    throw new ToolError(
      "INVALID_UPSTREAM",
      "Sally returned an oversized response.",
    );
  return JSON.parse(text);
}
