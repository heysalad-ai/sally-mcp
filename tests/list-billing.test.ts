import { afterEach, expect, it, vi } from "vitest";
import { executeTool } from "../src/tools";
import type { Env, Identity } from "../src/types";
const env = {
  SALLY_API_URL: "https://sally.example",
  SALLY_LIST_BILLING: "1",
  SALLY_ANONYMOUS_TOKEN: "synthetic-guest",
} as Env;
const identity = {
  userId: "member-a",
  upstreamToken: "synthetic-member",
  scopes: ["sally:tools"],
} as Identity;
const requestId = "e37bcc0e-7854-468c-8b34-5cd0de52be1a";
const submissionId = "5e7a2fd8-2ca0-44a4-a541-f22db7555ded";
const product = {
  id: "1",
  name: "Milk",
  pack_size: "2 pints",
  price: 1.8,
  currency: "GBP",
  url: "https://www.ocado.com/products/milk-123",
  in_stock: true,
};
const args = {
  list: ["milk", "bananas"],
  retailer: "ocado",
  candidates: [
    { item_index: 0, products: [product, { ...product, id: "2" }] },
    { item_index: 1, products: [{ ...product, name: "Bananas" }] },
  ],
};
afterEach(() => vi.unstubAllGlobals());
function server() {
  const calls = vi.fn().mockImplementation(async (url: URL) => {
    if (url.pathname === "/api/billing/shopping-requests")
      return Response.json({
        shopping_request_id: requestId,
        expires_at: Date.now() + 600000,
        unit: "submitted_shopping_list",
      });
    return Response.json({
      verdict: "confirm",
      reason: "Fixture accepted",
      confidence: 0.9,
      model: "synthetic-model",
    });
  });
  vi.stubGlobal("fetch", calls);
  return calls;
}
it("submits the whole list once and reuses its account-bound reference for every candidate", async () => {
  const calls = server();
  const result = await executeTool("match_products", args, env, identity);
  expect(
    calls.mock.calls.filter(
      ([url]) => url.pathname === "/api/billing/shopping-requests",
    ),
  ).toHaveLength(1);
  expect(JSON.parse(calls.mock.calls[0][1].body)).toMatchObject({
    list: ["1 milk", "1 bananas"],
  });
  expect(calls.mock.calls).toHaveLength(4);
  for (const [, options] of calls.mock.calls.slice(1)) {
    expect(options.headers["X-Sally-Shopping-Request"]).toBe(requestId);
    expect(options.headers.Authorization).toBe("Bearer synthetic-member");
  }
  expect(result).toMatchObject({
    shopping_request_id: requestId,
    unit: "submitted_shopping_list",
  });
});
it("keeps the submission key stable for exact retries", async () => {
  const calls = server();
  await executeTool(
    "match_products",
    { ...args, submission_id: submissionId },
    env,
    identity,
  );
  await executeTool(
    "match_products",
    { ...args, submission_id: submissionId },
    env,
    identity,
  );
  const starts = calls.mock.calls.filter(
    ([url]) => url.pathname === "/api/billing/shopping-requests",
  );
  expect(starts.map(([, opts]) => JSON.parse(opts.body).submission_id)).toEqual(
    [submissionId, submissionId],
  );
});
it("quota rejection stops all downstream candidate checks", async () => {
  const calls = vi.fn().mockResolvedValue(new Response("{}", { status: 402 }));
  vi.stubGlobal("fetch", calls);
  await expect(
    executeTool("match_products", args, env, identity),
  ).rejects.toMatchObject({ code: "SALLY_ALLOWANCE_EXHAUSTED" });
  expect(calls).toHaveBeenCalledTimes(1);
});
it("an explanation admits exactly one shopping-list line", async () => {
  const calls = server();
  await executeTool(
    "explain_match",
    {
      item: { name: "milk", quantity: 2, unit: "pints" },
      product: { ...product, confidence: null },
    },
    env,
    identity,
  );
  expect(JSON.parse(calls.mock.calls[0][1].body).list).toEqual([
    "2 pints milk",
  ]);
  expect(calls).toHaveBeenCalledTimes(2);
});
it("recipe preparation does not consume a submitted-shopping-list allowance", async () => {
  const calls = vi
    .fn()
    .mockResolvedValue(
      Response.json({ items: [{ name: "milk", quantity: 1 }], servings: 4 }),
    );
  vi.stubGlobal("fetch", calls);
  await executeTool(
    "recipe_to_list",
    { recipe_text: "Milk porridge for four", servings: 4 },
    env,
    identity,
  );
  expect(calls).toHaveBeenCalledTimes(1);
  expect(calls.mock.calls[0][0].pathname).toBe("/api/ai/generate-list");
});

it("an explanation within the matched list reuses its admission without another submission", async () => {
  const calls = server();
  const result = await executeTool(
    "explain_match",
    {
      item: { name: "milk", quantity: 1 },
      product: { ...product, confidence: null },
      shopping_request_id: requestId,
    },
    env,
    identity,
  );
  expect(calls).toHaveBeenCalledTimes(1);
  expect(calls.mock.calls[0][1].headers["X-Sally-Shopping-Request"]).toBe(
    requestId,
  );
  expect(result).not.toHaveProperty("submission_id");
});
