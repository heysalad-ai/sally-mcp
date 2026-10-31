import { fullRulesCheck } from "./rules";
import { z } from "zod";
import type { Env } from "./types";
import { candidate, item } from "./schemas";
import { upstream, ToolError } from "./upstream";
export type Candidate = z.infer<typeof candidate>;
const verdict = z.object({
  verdict: z.enum(["confirm", "veto"]),
  reason: z.string().max(3000),
  confidence: z.number().min(0).max(1).nullable().optional(),
  model: z.string(),
  fallback: z.boolean().optional(),
  thinking: z.unknown().optional(),
});
const hosts = {
  ocado: ["ocado.com"],
  waitrose: ["waitrose.com"],
  tesco: ["tesco.com"],
  asda: ["asda.com"],
};
export function validateRetailerUrl(url: string, retailer: keyof typeof hosts) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !hosts[retailer].some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
    )
  )
    throw new ToolError(
      "INVALID_CANDIDATE",
      "Candidate product URLs must belong to the selected retailer.",
    );
}
export function rulesCheck(line: string, name: string) {
  const r = fullRulesCheck(line, name);
  return {
    ...r,
    status: r.verdict,
    mode: "shadow",
    implementation: "typescript-port-783d766",
  };
}
export async function checkCandidate(
  env: Env,
  line: string,
  chosen: Candidate,
  token: string,
  runId: string,
  itemIndex: number,
  shoppingRequestId?: string,
) {
  const rules = rulesCheck(line, `${chosen.name} ${chosen.pack_size}`);
  const result = verdict.parse(
    await upstream(
      env,
      "/api/extension/ai/sense-check",
      {
        line,
        chosen: {
          name: `${chosen.name} ${chosen.pack_size}`,
          pricePence: Math.round(chosen.price * 100),
          availability: chosen.in_stock ? "in_stock" : "out_of_stock",
        },
        candidates: [],
        runId,
        itemIndex,
      },
      token,
      env.SALLY_API_URL,
      shoppingRequestId,
    ),
  );
  let nano: Record<string, unknown> = {
    status: "unavailable",
    mode: "shadow",
    reason:
      "Trained Sally-Nano checkpoint/inference endpoint is not configured.",
  };
  if (
    env.NANO_SHADOW_URL &&
    /^[a-f0-9]{64}$/.test(env.NANO_SHADOW_SHA256 ?? "")
  ) {
    try {
      const prediction = z
        .object({
          probability: z.number().min(0).max(1),
          model: z.string(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(
          await upstream(
            env,
            "/predict",
            { line, product: `${chosen.name} ${chosen.pack_size}` },
            env.NANO_SHADOW_TOKEN,
            env.NANO_SHADOW_URL,
          ),
        );
      if (prediction.sha256 !== env.NANO_SHADOW_SHA256)
        throw new Error("Unapproved Nano checkpoint");
      nano = {
        status: "ok",
        mode: "shadow",
        ...prediction,
        agrees:
          prediction.probability >= 0.5 === (result.verdict === "confirm"),
      };
    } catch {
      nano = { status: "error", mode: "shadow" };
    }
  }
  return { ...result, rules, sally_nano: nano };
}
export function lineText(i: z.infer<typeof item>) {
  return `${i.quantity}${i.unit ? ` ${i.unit}` : ""} ${i.name}`;
}
