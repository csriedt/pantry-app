import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

import { PetStatusSchema } from "@/types/petStore/petStatus";
import { petStoreStatusTag } from "@/types/petStore/petStoreCacheTags";

/**
 * Pet store webhook — invalidates the server cache for one status "from
 * outside".
 *
 * Uses `revalidateTag(tag, "max")` (stale-while-revalidate): the first read
 * after this is served stale and triggers the background recompute; the next
 * read gets fresh data. That is deliberate while the version-token doorbell
 * is being built — it keeps readers off the recompute's critical path. Use
 * `{ expire: 0 }` if the next read must block for fresh data, or the
 * `petStore/warm` variant to do the trigger read server-side.
 *
 * Invalidation only touches the server cache. Clients still hold React
 * Query's snapshot; a doorbell / `invalidateQueries` is what makes them
 * refetch.
 */
export async function POST(req: NextRequest) {
 let body: unknown;
 try {
  body = await req.json();
 } catch {
  return new Response("Invalid JSON", { status: 400 });
 }

 const parsed = PetStatusSchema.safeParse(
  (body as { status?: unknown } | null)?.status,
 );
 if (!parsed.success) {
  return new Response("Missing or invalid status", { status: 400 });
 }

 revalidateTag(petStoreStatusTag(parsed.data), "max");

 return new Response("ok", { status: 200 });
}
