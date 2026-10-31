import { z } from "zod";
import type { Env } from "./types";
import { upstream, ToolError } from "./upstream";
const admission = z.object({
  shopping_request_id: z.string().uuid(),
  expires_at: z.number(),
  unit: z.literal("submitted_shopping_list"),
});
export async function submitShoppingList(
  env: Env,
  list: string[],
  submissionId: string,
  token?: string,
) {
  if (!env.SALLY_LIST_BILLING) return undefined;
  if (env.SALLY_LIST_BILLING !== "1")
    throw new ToolError("CONFIGURATION", "Sally list billing is unavailable.");
  if (!token)
    throw new ToolError(
      "AUTH_REQUIRED",
      "Sally shopping access is unavailable. Connect your Sally account.",
    );
  return admission.parse(
    await upstream(
      env,
      "/api/billing/shopping-requests",
      { list, submission_id: submissionId },
      token,
    ),
  );
}
