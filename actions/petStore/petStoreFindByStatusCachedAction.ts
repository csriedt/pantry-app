// Server-side caching is parked for OpenNext/Cloudflare production deploys —
// see the incident links below — and enabled for the local/Node showcase.
// `cacheComponents: true` in next.config.ts is required for any `'use cache'`
// variant.
//
// Incident refs: https://github.com/vercel/next.js/issues/94880,
// https://github.com/better-auth/better-auth/issues/10103,
// https://github.com/opennextjs/opennextjs-cloudflare/issues/1062

"use server";

import { applyCachePolicy } from "@/lib/service/cache";
import { validateInput } from "@/lib/service/validation";
import { PetStatus, PetStatusSchema } from "@/types/petStore/petStatus";
import { PetStoreFindByStatusCachedListPayload } from "@/types/petStore/petStoreFindByStatusCachedListPayload";
import {
  GenericServerCachedRequest,
  ServerCacheOptions,
} from "@/types/service/payloads";

import { petStoreFindByStatusAction } from "./petStoreFindByStatusAction";

/**
 * Inner cached function. Only reached after the outer action has validated
 * its input, so validation errors are never cached. `cachedAt` is stamped
 * before return so it's part of the cached value — frozen on hits.
 */
async function fetchCachedPetsByStatus(
  status: PetStatus,
  cacheOptions?: ServerCacheOptions
): Promise<PetStoreFindByStatusCachedListPayload> {
  "use cache";
  applyCachePolicy(cacheOptions, [
    "pets-by-status",
    `pets-by-status-${status}`,
  ]);

  const result = await petStoreFindByStatusAction(status);
  return { ...result, cachedAt: new Date().toISOString() };
}

/**
 * Cached server action for fetching pets by status. Validation runs fresh
 * every call; caching only kicks in once `status` is known good.
 *
 * Invalidation: see `invalidatePetsByStatusAction`
 * (`updateTag` / `revalidateTag` on `pets-by-status` or
 * `pets-by-status-<status>`).
 */
export async function petStoreFindByStatusCachedAction(
  request: GenericServerCachedRequest<PetStatus>
): Promise<PetStoreFindByStatusCachedListPayload> {
  const validation = validateInput(PetStatusSchema, request.params);
  if (!validation.success) return { error: validation.error };
  return fetchCachedPetsByStatus(validation.data, request.cacheOptions);
}
