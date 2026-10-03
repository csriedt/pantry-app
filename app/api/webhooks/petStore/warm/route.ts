import { revalidateTag } from "next/cache";
import { after } from "next/server";
import type { NextRequest } from "next/server";

import { petStoreFindByStatusCachedAction } from "@/actions/petStore/petStoreFindByStatusCachedAction";
import { PetStatus, PetStatusSchema } from "@/types/petStore/petStatus";

const WARM_ATTEMPTS = 6;
const WARM_BASE_DELAY_MS = 200;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Warm the cache entry for `status` off the request path.
 *
 * `revalidateTag` only writes a stale marker, and writes it asynchronously.
 * The first read after it is served stale and *triggers* the recompute; only
 * a later read sees the fresh value. So the warm loops until `cachedAt` moves
 * past the baseline captured before invalidation, then stops. If the
 * recompute is never observed it gives up and logs rather than looping
 * forever.
 */
async function warmStatus(
  status: PetStatus,
  baselineCachedAt: string | undefined
): Promise<void> {
  for (let attempt = 0; attempt < WARM_ATTEMPTS; attempt++) {
    await sleep(WARM_BASE_DELAY_MS * (attempt + 1));
    const result = await petStoreFindByStatusCachedAction({ params: status });
    if (result.cachedAt !== baselineCachedAt) return;
  }
  console.warn(`[petStore warm] recompute not observed for ${status}`);
}

/**
 * Warm variant of the pet store webhook.
 *
 * Same job as `app/api/webhooks/petStore/route.ts` — invalidate one status's
 * server cache from outside — plus a warm read scheduled with `after()` so
 * the recompute happens off the webhook's own request path.
 *
 * Why warming exists: with `revalidateTag(tag, "max")`, the first read after
 * the invalidation is served stale and triggers the recompute; the doorbell's
 * first data fetch would therefore be stale too. Warming makes that read
 * server-side, so the client's first refetch is a hit. The version-token
 * doorbell remains the second half of the story (it tells clients when to
 * re-check).
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

  // Baseline for "has the entry actually recomputed?" — normally a cache hit.
  // On a cold cache this read populates the entry instead.
  const before = await petStoreFindByStatusCachedAction({ params: parsed.data });

  revalidateTag(`pets-by-status-${parsed.data}`, "max");

  // Keep the webhook response fast; the warm runs after the response is sent.
  after(() => warmStatus(parsed.data, before.cachedAt));

  return new Response("ok", { status: 200 });
}
