import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const base = process.argv[2] ?? "http://localhost:8787";
const client = new Client({ name: "sally-smoke", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base)));
const brand = client.getServerVersion();
assert.equal(brand?.title, "Sally by HeySalad®");
assert.equal(brand?.websiteUrl, "https://heysalad.ai/sally");
const icon = await fetch(brand!.icons![0].src);
assert.equal(icon.status, 200);
assert.match(icon.headers.get("content-type") ?? "", /image\/svg\+xml/);
assert.match(await icon.text(), /#ed4c4c/);
const tools = await client.listTools();
assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
  "basket_link",
  "explain_match",
  "match_products",
  "recipe_to_list",
]);
const resources = await client.listResources();
assert.equal(resources.resources[0].uri, "ui://sally/products-v2.html");
const widget = await client.readResource({
  uri: "ui://sally/products-v2.html",
});
assert.match(
  String("text" in widget.contents[0] ? widget.contents[0].text : ""),
  /Grandstander/,
);
const imageOrigins = (widget.contents[0]._meta as any).ui.csp.resourceDomains;
for (const origin of [
  "https://digitalcontent.api.tesco.com",
  "https://ecom-su-static-prod.wtrecom.com",
  "https://asdagroceries.scene7.com",
])
  assert.ok(imageOrigins.includes(origin));
const result = await client.callTool({
  name: "match_products",
  arguments: { list: ["milk"], retailer: "ocado", candidates: [] },
});
assert.equal(result.isError, undefined);
assert.equal((result.structuredContent as any).matches[0].product, null);
const auth = await client.callTool({
  name: "basket_link",
  arguments: { list: ["milk"], retailer: "ocado" },
});
assert.equal(auth.isError, true);
assert.ok((auth._meta as any)["mcp/www_authenticate"]);
await client.close();
const health = await fetch(base + "/health");
assert.equal(health.status, 200);
const invalid = await fetch(base + "/mcp", {
  method: "POST",
  headers: {
    Authorization: "Bearer invalid",
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }),
});
assert.equal(invalid.status, 401);
assert.match(
  invalid.headers.get("www-authenticate") ?? "",
  /resource_metadata/,
);
const forbidden = await fetch(base + "/mcp", {
  headers: { Origin: "https://attacker.example" },
});
assert.equal(forbidden.status, 403);
const metadataResponse = await fetch(
  base + "/.well-known/oauth-protected-resource/mcp",
);
assert.equal(metadataResponse.status, 200);
const metadata = (await metadataResponse.json()) as any;
assert.equal(metadata.resource, base + "/mcp");
const asResponse = await fetch(
  base + "/.well-known/oauth-authorization-server",
);
assert.equal(asResponse.status, 200);
const as = (await asResponse.json()) as any;
assert.ok(as.code_challenge_methods_supported.includes("S256"));
const registration = await fetch(base + "/oauth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: "Sally smoke",
    redirect_uris: ["http://127.0.0.1/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  }),
});
assert.equal(registration.status, 201);
const registered = (await registration.json()) as any;
const noPkce = new URL(base + "/authorize");
for (const [key, value] of Object.entries({
  client_id: registered.client_id,
  redirect_uri: "http://127.0.0.1/callback",
  response_type: "code",
  scope: "sally:tools",
  resource: base + "/mcp",
  state: "smoke",
}))
  noPkce.searchParams.set(key, value as string);
const rejected = await fetch(noPkce, { redirect: "manual" });
assert.ok([302, 400].includes(rejected.status));
if (rejected.status === 302)
  assert.match(rejected.headers.get("location") ?? "", /error=/);
noPkce.searchParams.set("code_challenge", "q".repeat(43));
noPkce.searchParams.set("code_challenge_method", "S256");
const consent = await fetch(noPkce, { redirect: "manual" });
assert.equal(consent.status, 200);
assert.match(await consent.text(), /127.0.0.1/);
assert.ok(consent.headers.get("set-cookie"));
assert.match(
  consent.headers.get("content-security-policy") ?? "",
  /frame-ancestors 'none'/,
);
console.log(
  JSON.stringify(
    {
      base,
      tools: tools.tools.map((t) => t.name),
      checks:
        "MCP initialize/discovery/resource/calls, auth challenge, invalid-token rejection, origin validation, OAuth metadata, DCR, PKCE and consent cookie: PASS",
    },
    null,
    2,
  ),
);
