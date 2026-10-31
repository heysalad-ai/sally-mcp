import { afterEach, expect, it, vi } from "vitest";
import { upstream } from "../src/upstream";
import type { Env } from "../src/types";
afterEach(() => vi.unstubAllGlobals());
it.each([
  [402, "SALLY_ALLOWANCE_EXHAUSTED"],
  [403, "SALLY_ACCESS_DENIED"],
  [429, "RATE_LIMITED"],
  [401, "SALLY_SIGN_IN_REQUIRED"],
  [503, "UPSTREAM_UNAVAILABLE"],
])(
  "preserves the meaning of upstream HTTP %i without exposing provider details",
  async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private provider/account details", {
          status: status as number,
        }),
      ),
    );
    const result = upstream(
      { SALLY_API_URL: "https://sally.example" } as Env,
      "/api/ai/generate-list",
      {},
    );
    await expect(result).rejects.toMatchObject({ code });
    await expect(result).rejects.not.toThrow(
      "private provider/account details",
    );
  },
);
