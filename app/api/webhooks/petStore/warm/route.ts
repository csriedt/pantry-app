import { revalidateTag } from "next/cache";
import { after } from "next/server";
import type { NextRequest } from "next/server";

import { petStoreFindByStatusCachedAction } from "@/actions/petStore/petStoreFindByStatusCachedAction";
import { PetStatusSchema } from "@/types/petStore/petStatus";
import { petStoreStatusTag } from "@/types/petStore/petStoreCacheTags";

/**
 * Delay before the warm read. `revalidateTag` is not awaited — the tag write
 * lands a beat after the call returns — so the warm read waits for it to be
 * applied before doing the trigger read. There is no public API to await, so
 * this is a pragmatic best-effort figure.
 */
const WARM_DELAY_MS = 300;

const sleep = (ms: number): Promise<void> =>
 new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Warm variant of the pet store webhook.
 *
 * Same job as `app/api/webhooks/petStore/route.ts` — invalidate one status's
 * server cache from outside — plus a warm read scheduled with `after()`.
 *
 * `revalidateTag(tag, "max")` is stale-while-revalidate: the first read after
 * the tag is applied is served stale and *triggers* the background recompute;
 * only a later read sees the fresh value. The warm read is that trigger,
 * moved server-side and off the webhook's response path, so the first client
 * read often lands on a fresh entry instead of paying the trigger itself.
 *
 * Best effort by design: a client read that arrives before the recompute
 * finishes still gets the stale copy and needs another read. The version
 * token is the completion signal that closes that race; this route only
 * front-runs the work.
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
