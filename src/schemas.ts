import { z } from "zod";
export const retailer = z.enum(["ocado", "waitrose", "tesco", "asda"]);
export const item = z
  .object({
    name: z.string().trim().min(1).max(200),
    quantity: z.number().positive().max(10000).default(1),
    unit: z.string().trim().max(40).optional(),
  })
  .strict();
export const candidate = z
  .object({
    id: z.string().max(200),
    name: z.string().min(1).max(300),
    price: z.number().nonnegative(),
    currency: z.literal("GBP"),
    pack_size: z.string().max(100),
    url: z.string().url().startsWith("https://"),
    image_url: z.string().url().startsWith("https://").optional(),
    in_stock: z.boolean().default(true),
  })
  .strict();
export const list = z
  .array(z.union([z.string().trim().min(1).max(200), item]))
  .min(1)
  .max(40);
export const product = z
  .object({
    id: z.string().max(200),
    name: z.string().min(1).max(300),
    price: z.number().nonnegative(),
    currency: z.literal("GBP"),
    pack_size: z.string().max(100),
    image_url: z.string().url().startsWith("https://").optional(),
    url: z.string().url().startsWith("https://"),
    confidence: z.number().min(0).max(1).nullable(),
    in_stock: z.boolean().optional(),
  })
  .strict();
export const toolInputs = {
  match_products: z
    .object({
      list,
      retailer,
      submission_id: z
        .string()
        .uuid()
        .optional()
        .describe(
          "Reuse only when retrying the exact same submitted shopping list; omit for a new submission.",
        ),
      candidates: z
        .array(
          z
            .object({
              item_index: z.number().int().min(0).max(39),
              products: z.array(candidate).max(3),
            })
            .strict(),
        )
        .max(10),
    })
    .strict(),
  explain_match: z
    .object({
      item,
      product,
      shopping_request_id: z
        .string()
        .uuid()
        .optional()
        .describe(
          "Reuse the reference returned by match_products to explain an item in that submitted list without another allowance.",
        ),
      submission_id: z
        .string()
        .uuid()
        .optional()
        .describe(
          "Reuse only for an exact retry of this single-item submission.",
        ),
    })
    .strict(),
  recipe_to_list: z
    .object({
      recipe_text: z.string().trim().min(1).max(16000),
      servings: z.number().int().min(1).max(24),
    })
    .strict(),
  basket_link: z.object({ list, retailer }).strict(),
};
export const note = z.object({
  style: z.literal("amber"),
  text: z.string().min(1).max(500),
});
export const recipeOutput = z.object({
  servings: z.number().int().min(1).max(24).optional(),
  items: z
    .array(item.extend({ category: z.string().optional() }).strip())
    .min(1)
    .max(100),
});
export function normaliseList(input: z.infer<typeof list>) {
  return input.map((i) =>
    typeof i === "string" ? { name: i, quantity: 1 } : i,
  );
}
