"use server";

import { updateTag } from "next/cache";

import { PetStatus } from "@/types/petStore/petStatus";

/**
 * Invalidate the server-side `'use cache'` entries for pets-by-status.
 *
 * - With a `status`, purges only `pets-by-status-<status>` so the other
 *   statuses keep their cached values.
 * - Without a `status`, purges the global `pets-by-status` tag, which
 *   matches every status variant.
 *
 * Uses {@link updateTag} (server-actions only) which gives "read-your-own-
 * writes" semantics — the next request to the cached action waits for
 * fresh data instead of serving stale-while-revalidate. That makes the
 * demo's `cachedAt` jump forward on the very next refetch, which is what
 * we want to visualise.
 *
 * For webhook / route-handler invalidation, use `revalidateTag(tag, 'max')`
 * instead (stale-while-revalidate) or `revalidateTag(tag, { expire: 0 })`
 * for immediate expiry from outside a server action.
 *
 * `updateTag` only invalidates the *server* cache. Clients still hold
 * React Query's snapshot; after calling this action, trigger a refetch
 * (`query.refetch()` or `queryClient.invalidateQueries(...)`) so the next
 * call repopulates the cache from upstream.
 */
export async function invalidatePetsByStatusAction(
  status?: PetStatus
): Promise<void> {
  if (status) {
    updateTag(`pets-by-status-${status}`);
    return;
  }
  updateTag("pets-by-status");
}
