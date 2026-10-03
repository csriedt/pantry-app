import { revalidateTag } from "next/cache";
import { after } from "next/server";
import type { NextRequest } from "next/server";

import { petStoreFindByStatusCachedAction } from "@/actions/petStore/petStoreFindByStatusCachedAction";
import { PetStatusSchema } from "@/types/petStore/petStatus";

/**
 * Delay before the warm read. `revalidateTag` is not awaited — the tag write
 * lands a beat after the call returns — so a read in the same tick can still
 * see the old entry and warm nothing. There is no public API to await, so
 * this is a pragmatic best-effort figure.
 */
const WARM_DELAY_MS = 300;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Warm variant of the pet store webhook.
 *
 * Same job as `app/api/webhooks/petStore/route.ts` — invalidate one status's
 * server cache from outside — plus a warm read scheduled with `after()`.
 *
 * With `revalidateTag(tag, "max")` the first read after invalidation is
 * served stale and *triggers* the background recompute; only a later read
 * sees the fresh value. One delayed read is enough to start that recompute
 * server-side, so the doorbell's first data fetch lands on a fresh entry.
 *
 * Best effort by design: no confirmation step. The version-token doorbell
 * (when it lands) is the correctness net; this is purely an optimisation.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = PetStatusSchema.safeParse(
    (body as { status?: unknown } | null)?.status
  );
  if (!parsed.success) {
    return new Response("Missing or invalid status", { status: 400 });
  }

  revalidateTag(`pets-by-status-${parsed.data}`, "max");

  // Keep the webhook response fast; the trigger read runs after it is sent.
  after(async () => {
    await sleep(WARM_DELAY_MS);
    try {
      await petStoreFindByStatusCachedAction({ params: parsed.data });
    } catch (error) {
      console.warn("[petStore warm] trigger read failed:", error);
    }
  });

  return new Response("ok", { status: 200 });
}
