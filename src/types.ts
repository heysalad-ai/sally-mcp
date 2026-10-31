import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  PUBLIC_ORIGIN: string;
  PROXY_ONLY?: string;
  PROXY_SHARED_SECRET?: string;
  SALLY_API_URL: string;
  SALLY_LIST_BILLING?: string;
  NANO_SHADOW_URL?: string;
  NANO_SHADOW_SHA256?: string;
  SALLY_ANONYMOUS_TOKEN?: string;
  USAGE_HMAC_KEY: string;
  NANO_SHADOW_TOKEN?: string;
}
export interface Identity {
  userId: string;
  upstreamToken: string;
  scopes: string[];
}
export type ToolName =
  "match_products" | "explain_match" | "recipe_to_list" | "basket_link";
