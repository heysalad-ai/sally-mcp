import { submitShoppingList } from "./billing";
import { z } from "zod";
import type { Env, Identity, ToolName } from "./types";
import { toolInputs, normaliseList, recipeOutput } from "./schemas";
import { upstream, ToolError } from "./upstream";
export { upstream, ToolError } from "./upstream";
import { checkCandidate, validateRetailerUrl, lineText } from "./matching";
const stores = {
  ocado: "https://www.ocado.com/",
  waitrose: "https://www.waitrose.com/ecom/shop/",
  tesco: "https://www.tesco.com/groceries/",
  asda: "https://groceries.asda.com/",
};
export async function executeTool(
  name: ToolName,
  args: unknown,
  env: Env,
  identity?: Identity,
) {
  if (name === "match_products") {
    const input = toolInputs.match_products.parse(args);
    const items = normaliseList(input.list);
    const runId = input.submission_id ?? crypto.randomUUID();
    if (
      new Set(input.candidates.map((c) => c.item_index)).size !==
        input.candidates.length ||
      input.candidates.some((c) => c.item_index >= items.length)
    )
      throw new ToolError(
        "INVALID_CANDIDATE",
        "Candidate item indexes must be unique and refer to this list.",
      );
    for (const group of input.candidates)
      for (const p of group.products)
        validateRetailerUrl(p.url, input.retailer);
    const token =
      identity?.upstreamToken ||
      (await env.OAUTH_KV?.get("guest:upstream")) ||
      env.SALLY_ANONYMOUS_TOKEN;
    const shoppingRequest = await submitShoppingList(
      env,
      items.map(lineText),
      runId,
      token,
    );
    const matches = [];
    for (let i = 0; i < items.length; i++) {
      const notes: { style: "amber"; text: string }[] = [];
      let selected = null;
      let explanation = null;
      const candidates =
        input.candidates
          .find((c) => c.item_index === i)
          ?.products.filter((p) => p.in_stock) ?? [];
      if (candidates.length && !token)
        throw new ToolError(
          "ANONYMOUS_UPSTREAM_UNAVAILABLE",
          "Anonymous Sally API access is not configured. Connect your Sally account.",
        );
      for (const p of candidates) {
        const result = await checkCandidate(
          env,
          lineText(items[i]),
          p,
          token!,
          runId,
          i,
          shoppingRequest?.shopping_request_id,
        );
        if (
          result.verdict === "confirm" &&
          (!selected ||
            (result.confidence ?? 0) > (selected.confidence ?? 0) ||
            ((result.confidence ?? 0) === (selected.confidence ?? 0) &&
              p.price < selected.price))
        ) {
          selected = { ...p, confidence: result.confidence ?? null };
          explanation = result;
        }
      }
      if (!selected)
        notes.push({
          style: "amber",
          text: candidates.length
            ? "None of the supplied candidates was accepted. Review alternatives in the Sally extension."
            : "No in-stock retailer-page candidates supplied. Open the retailer in the Sally extension; this tool does not search the catalogue.",
        });
      if (selected && (!selected.pack_size || !items[i].unit))
        notes.push({
          style: "amber",
          text: "Confirm pack size and number of packs before adding to your basket.",
        });
      if (explanation?.rules.reasons.length)
        notes.push({
          style: "amber",
          text: explanation.rules.reasons.join(" "),
        });
      matches.push({
        item: items[i].name,
        product: selected,
        notes,
        explanation,
      });
    }
    return {
      matches,
      retailer: input.retailer,
      run_id: runId,
      ...(shoppingRequest ? { submission_id: runId, ...shoppingRequest } : {}),
      checked_at: new Date().toISOString(),
      source:
        "user-supplied retailer-page candidates; prices are observations, not live catalogue quotes",
      disclaimer:
        "Review prices, stock, pack sizes, quantities and allergens at the retailer. You always check out and pay.",
    };
  }
  if (!identity)
    throw new ToolError(
      "AUTH_REQUIRED",
      "Connect your Sally account to use this tool.",
    );
  if (name === "explain_match") {
    const input = toolInputs.explain_match.parse(args);
    const submissionId = input.submission_id ?? crypto.randomUUID();
    const shoppingRequest = input.shopping_request_id
      ? { shopping_request_id: input.shopping_request_id }
      : await submitShoppingList(
          env,
          [lineText(input.item)],
          submissionId,
          identity.upstreamToken,
        );
    const result = await checkCandidate(
      env,
      lineText(input.item),
      { ...input.product, in_stock: true },
      identity.upstreamToken,
      submissionId,
      0,
      shoppingRequest?.shopping_request_id,
    );
    return {
      ...(shoppingRequest
        ? {
            ...shoppingRequest,
            ...(input.shopping_request_id
              ? {}
              : { submission_id: submissionId }),
          }
        : {}),
      matches: result.verdict === "confirm",
      explanation: result.reason,
      confidence: result.confidence ?? null,
      model: result.model,
      rules: result.rules,
      sally_nano: result.sally_nano,
      notes: result.rules.reasons.map((text) => ({ style: "amber", text })),
    };
  }
  if (name === "recipe_to_list") {
    const input = toolInputs.recipe_to_list.parse(args);
    const result = recipeOutput.parse(
      await upstream(
        env,
        "/api/ai/generate-list",
        { input: input.recipe_text, servings: input.servings },
        identity.upstreamToken,
      ),
    );
    if (result.servings !== undefined && result.servings !== input.servings)
      throw new ToolError(
        "SERVINGS_MISMATCH",
        `Sally returned quantities for ${result.servings} servings instead of ${input.servings}. Please try again.`,
      );
    return {
      items: result.items,
      requested_servings: input.servings,
      applied_servings: result.servings ?? null,
      notes: [
        {
          style: "amber",
          text:
            result.servings === undefined
              ? "Sally has not confirmed the serving count. Confirm ingredient amounts before shopping."
              : "Review ingredient amounts, pack sizes and allergens before shopping.",
        },
      ],
    };
  }
  const input = toolInputs.basket_link.parse(args);
  const items = normaliseList(input.list);
  return {
    retailer: input.retailer,
    url: stores[input.retailer],
    list: items,
    extension_text: items
      .map((i, index) =>
        typeof input.list[index] === "string"
          ? input.list[index]
          : `${i.quantity}${i.unit ? ` ${i.unit}` : ""} ${i.name}`,
      )
      .join("\n"),
    instructions: [
      "Open the retailer link in Chrome.",
      "Open the Sally Chrome extension and sign in.",
      "Paste the shopping list below and select the same retailer.",
      "Review Sally’s proposed products, amber notes, pack sizes and quantities; confirm adding items to the basket.",
      "Review the basket yourself. Only you check out and pay.",
    ],
    checkout: false,
    payment: false,
  };
}
