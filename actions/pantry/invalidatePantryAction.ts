"use server";

import { updateTag } from "next/cache";

import { pantryDataTag } from "@/types/pantry/pantryCacheTags";

/**
 * Invalidate the pantry family's server-cache entry for one user.
 *
 * Write actions call this after a successful write (every writer
 * invalidates — a stale server entry can't be healed by retries, since a
 * cache hit never re-runs the read). With the read currently uncached this
 * is a forward-wiring no-op; the read-side cache lands with its own
 * decision, and the tag builder here stays the single source of truth.
 */
export async function invalidatePantryAction(userId: string): Promise<void> {
  updateTag(pantryDataTag(userId));
}
