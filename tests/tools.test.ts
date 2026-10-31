import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "../src/tools";
import { toolInputs } from "../src/schemas";
import { checkCandidate, rulesCheck } from "../src/matching";
import type { Env, Identity } from "../src/types";
const env = {
  SALLY_API_URL: "https://sally-api-dev.heysalad-o.workers.dev",
  SALLY_ANONYMOUS_TOKEN: "guest-test-token",
} as Env;
const identity: Identity = {
  userId: "test",
  upstreamToken: "sally-user-test-token",
  scopes: ["sally:tools"],
};
const product = {
  id: "1",
  name: "Whole milk",
  pack_size: "2 pints",
  price: 1.8,
  currency: "GBP" as const,
  url: "https://www.ocado.com/products/milk",
  in_stock: true,
};
const args = {
  list: ["milk"],
  retailer: "ocado",
  candidates: [{ item_index: 0, products: [product] }],
};
const accepted = {
  verdict: "confirm",
  reason: "correct milk",
  confidence: 0.94,
  model: "decisions:gpt-6-luna",
  fallback: false,
};
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetcher = vi.fn().mockResolvedValue(Response.json(accepted));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
describe("match_products", () => {
  it("calls the verified dev sense-check contract and returns observed price + computed confidence", async () => {
    const r = await executeTool("match_products", args, env);
    expect(r).toMatchObject({
      retailer: "ocado",
      matches: [
        {
          product: { price: 1.8, confidence: 0.94 },
          explanation: { model: "decisions:gpt-6-luna" },
        },
      ],
    });
    expect(fetcher.mock.calls[0][0].href).toBe(
      env.SALLY_API_URL + "/api/extension/ai/sense-check",
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      line: "1 milk",
      chosen: { name: "Whole milk 2 pints" },
    });
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer guest-test-token",
    );
  });
  it("does not invent products when candidates are missing", async () => {
    const r = await executeTool(
      "match_products",
      { list: ["milk"], retailer: "ocado", candidates: [] },
      env,
    );
    expect(r).toMatchObject({
      matches: [{ product: null, notes: [{ style: "amber" }] }],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("vetoes the first candidate then checks another", async () => {
    fetcher
      .mockResolvedValueOnce(Response.json({ ...accepted, verdict: "veto" }))
      .mockResolvedValueOnce(Response.json(accepted));
    const r = await executeTool(
      "match_products",
      {
        ...args,
        candidates: [
          {
            item_index: 0,
            products: [product, { ...product, id: "2", name: "Other milk" }],
          },
        ],
      },
      env,
    );
    expect(r).toMatchObject({ matches: [{ product: { id: "2" } }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("returns no product for all-veto verdicts", async () => {
    fetcher.mockResolvedValue(Response.json({ ...accepted, verdict: "veto" }));
    expect(await executeTool("match_products", args, env)).toMatchObject({
      matches: [{ product: null }],
    });
  });
  it("rejects wrong-retailer links before calling upstream", async () => {
    await expect(
      executeTool(
        "match_products",
        {
          ...args,
          candidates: [
            {
              item_index: 0,
              products: [
                { ...product, url: "https://www.ocado.com.attacker.example/x" },
              ],
            },
          ],
        },
        env,
      ),
    ).rejects.toThrow("selected retailer");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects duplicate candidate indexes", async () => {
    await expect(
      executeTool(
        "match_products",
        { ...args, candidates: [args.candidates[0], args.candidates[0]] },
        env,
      ),
    ).rejects.toThrow("unique");
  });
  it("cannot use anonymous access when guest credential is missing", async () => {
    await expect(
      executeTool("match_products", args, {
        ...env,
        SALLY_ANONYMOUS_TOKEN: undefined,
      }),
    ).rejects.toThrow("Anonymous");
  });
  it("skips out of stock candidates", async () => {
    expect(
      await executeTool(
        "match_products",
        {
          ...args,
          candidates: [
            { item_index: 0, products: [{ ...product, in_stock: false }] },
          ],
        },
        env,
      ),
    ).toMatchObject({ matches: [{ product: null }] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("propagates upstream failure without leaking body or credentials", async () => {
    fetcher.mockResolvedValue(
      new Response("secret upstream details", { status: 500 }),
    );
    await expect(executeTool("match_products", args, env)).rejects.toThrow(
      "Sally API request failed (500)",
    );
  });
  it("rejects a fabricated upstream confidence outside 0..1", async () => {
    fetcher.mockResolvedValue(Response.json({ ...accepted, confidence: 17 }));
    await expect(executeTool("match_products", args, env)).rejects.toThrow();
  });
});
describe("explain_match", () => {
  it("requires sign-in", async () => {
    await expect(
      executeTool(
        "explain_match",
        { item: { name: "milk" }, product: { ...product, confidence: 0.9 } },
        env,
      ),
    ).rejects.toThrow("Connect");
  });
  it("reports actual model and unavailable Nano honestly", async () => {
    expect(
      await executeTool(
        "explain_match",
        {
          item: { name: "milk" },
          product: {
            id: product.id,
            name: product.name,
            pack_size: product.pack_size,
            price: product.price,
            currency: product.currency,
            url: product.url,
            confidence: 0.9,
          },
        },
        env,
        identity,
      ),
    ).toMatchObject({
      matches: true,
      model: accepted.model,
      sally_nano: { status: "unavailable", mode: "shadow" },
    });
  });
  it("shadow veto never overrides API acceptance", async () => {
    expect(
      await checkCandidate(
        env,
        "coconut milk",
        { ...product, name: "Coconut milk drink" },
        identity.upstreamToken,
        "run",
        0,
      ),
    ).toMatchObject({
      verdict: "confirm",
      rules: { status: "reject", mode: "shadow" },
    });
  });
  it("captures Nano agreement when configured and isolates Nano failure", async () => {
    fetcher
      .mockResolvedValueOnce(Response.json(accepted))
      .mockResolvedValueOnce(
        Response.json({
          probability: 0.2,
          model: "s5-nano1x64-mf12-s0",
          sha256: "a".repeat(64),
        }),
      );
    expect(
      await checkCandidate(
        {
          ...env,
          NANO_SHADOW_URL: "https://nano.example",
          NANO_SHADOW_SHA256: "a".repeat(64),
        },
        "milk",
        product,
        identity.upstreamToken,
        "run",
        0,
      ),
    ).toMatchObject({
      verdict: "confirm",
      sally_nano: { agrees: false, status: "ok" },
    });
  });
});
describe("recipe_to_list", () => {
  it("uses generate-list, forwards servings, normalises category, warns about upstream household preference", async () => {
    fetcher.mockResolvedValue(
      Response.json({
        items: [
          { name: "tomatoes", quantity: 400, unit: "g", category: "produce" },
        ],
      }),
    );
    expect(
      await executeTool(
        "recipe_to_list",
        { recipe_text: "Tomato pasta", servings: 4 },
        env,
        identity,
      ),
    ).toMatchObject({
      items: [{ name: "tomatoes", quantity: 400, unit: "g" }],
      notes: [{ style: "amber" }],
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      input: "Tomato pasta",
      servings: 4,
    });
  });
  it("requires sign-in and rejects malformed recipe result", async () => {
    await expect(
      executeTool("recipe_to_list", { recipe_text: "x", servings: 2 }, env),
    ).rejects.toThrow("Connect");
    fetcher.mockResolvedValue(Response.json({ items: [] }));
    await expect(
      executeTool(
        "recipe_to_list",
        { recipe_text: "x", servings: 2 },
        env,
        identity,
      ),
    ).rejects.toThrow();
  });
});
describe("basket_link", () => {
  it("preserves free-text quantities instead of prefixing a second quantity", async () => {
    const result = await executeTool(
      "basket_link",
      { list: ["200g pasta", "1 onion", "milk"], retailer: "ocado" },
      env,
      identity,
    );
    expect(result).toMatchObject({
      extension_text: "200g pasta\n1 onion\nmilk",
      checkout: false,
      payment: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["ocado", "waitrose", "tesco", "asda"])(
    "prepares %s handoff without network, checkout or payment",
    async (retailer) => {
      const r = await executeTool(
        "basket_link",
        { list: [{ name: "milk", quantity: 2, unit: "pints" }], retailer },
        env,
        identity,
      );
      expect(r).toMatchObject({
        checkout: false,
        payment: false,
        extension_text: "2 pints milk",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("requires sign-in", async () => {
    await expect(
      executeTool("basket_link", { list: ["milk"], retailer: "ocado" }, env),
    ).rejects.toThrow("Connect");
  });
});
it("rejects invalid retailer, unbounded lists, quantities, serving counts and extra fields", () => {
  expect(
    toolInputs.match_products.safeParse({ ...args, retailer: "unknown" })
      .success,
  ).toBe(false);
  expect(
    toolInputs.basket_link.safeParse({
      list: Array(41).fill("milk"),
      retailer: "ocado",
    }).success,
  ).toBe(false);
  expect(
    toolInputs.recipe_to_list.safeParse({ recipe_text: "x", servings: 0 })
      .success,
  ).toBe(false);
  expect(
    toolInputs.basket_link.safeParse({
      list: [{ name: "milk", quantity: -1 }],
      retailer: "ocado",
    }).success,
  ).toBe(false);
  expect(
    toolInputs.basket_link.safeParse({
      list: ["milk"],
      retailer: "ocado",
      pay: true,
    }).success,
  ).toBe(false);
});
it("rules report size doubts without asserting acceptance", () => {
  expect(rulesCheck("milk 1l", "milk 250ml").status).toBe("reject");
  expect(rulesCheck("tomatoes", "tomatoes").status).toBe("unknown");
});

it("uses Worker-supported manual redirects and refuses redirects without forwarding credentials", async () => {
  fetcher.mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: "https://attacker.example" },
    }),
  );
  await expect(executeTool("match_products", args, env)).rejects.toThrow(
    "Sally API request failed (302)",
  );
  expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not label legacy recipe output as confirmed scaling", async () => {
  fetcher.mockResolvedValue(
    Response.json({ items: [{ name: "pasta", quantity: 200, unit: "g" }] }),
  );
  const result = await executeTool(
    "recipe_to_list",
    { recipe_text: "Pasta", servings: 4 },
    env,
    identity,
  );
  expect(result).toMatchObject({
    requested_servings: 4,
    applied_servings: null,
  });
  expect(result).not.toHaveProperty("servings");
  expect(JSON.stringify(result)).toContain("has not confirmed");
});
it("reports the serving count confirmed by the API", async () => {
  fetcher.mockResolvedValue(
    Response.json({
      items: [{ name: "pasta", quantity: 400, unit: "g" }],
      servings: 4,
    }),
  );
  expect(
    await executeTool(
      "recipe_to_list",
      { recipe_text: "Pasta", servings: 4 },
      env,
      identity,
    ),
  ).toMatchObject({ requested_servings: 4, applied_servings: 4 });
});
it("rejects known recipe scaling mismatches", async () => {
  fetcher.mockResolvedValue(
    Response.json({
      items: [{ name: "pasta", quantity: 200, unit: "g" }],
      servings: 2,
    }),
  );
  await expect(
    executeTool(
      "recipe_to_list",
      { recipe_text: "Pasta", servings: 4 },
      env,
      identity,
    ),
  ).rejects.toThrow("2 servings instead of 4");
});
