import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

import { PetStatusSchema } from "@/types/petStore/petStatus";

/**
 * Pet store webhook — invalidates the server cache for one status "from
 * outside".
 *
 * Route handlers cannot use `updateTag` (server-actions only), so this uses
 * `revalidateTag(tag, { expire: 0 })`: the next read blocks for fresh data
 * instead of serving stale-while-revalidate. Use `"max"` only when serving a
 * stale copy is acceptable and the client will re-check (e.g. with the
 * version-token doorbell).
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
    (body as { status?: unknown } | null)?.status
  );
  if (!parsed.success) {
    return new Response("Missing or invalid status", { status: 400 });
  }

  revalidateTag(`pets-by-status-${parsed.data}`, { expire: 0 });

  return new Response("ok", { status: 200 });
}
