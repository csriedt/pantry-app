import { petStoreFindByStatusCachedAction } from "@/actions/petStore/petStoreFindByStatusCachedAction";
import { PetStatus } from "@/types/petStore/petStatus";
import { PetStoreFindByStatusCachedListPayload } from "@/types/petStore/petStoreFindByStatusCachedListPayload";
import { ServerCacheOptions } from "@/types/service/payloads";

import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { findByStatusCachedKey } from "./petStoreQueryKeys";

/**
 * React hook for querying pets by status with server-side caching.
 *
 * Wraps `petStoreFindByStatusCachedAction` with React Query for client-side
 * state management. The server action caches API responses via the
 * `'use cache'` directive, so frequent client-side polling does not over-hit
 * the upstream API.
 *
 * Uses the `['find-by-status-cached', …]` key family so it doesn't collide
 * with the non-cached `usePetStoreFindByStatus` hook (which uses
 * `['find-by-status', …]` and is invalidated by `useCreatePet` on success).
 * The cached hook's client cache is orthogonal — server-side invalidation
 * flows through `cacheTag` / `updateTag`.
 *
 * @param cacheOptions - Optional server cache configuration passed to every
 *   query. Overrides the default tags / revalidate behaviour.
 *
 * @returns A tuple `[queryState, actionDispatcher]`:
 *   - `queryState`: React Query state. The data includes a `cachedAt` ISO
 *     timestamp set inside the cached function — frozen on cache hits,
 *     refreshed on misses.
 *   - `actionDispatcher`: triggers the query with a status parameter.
 *
 * @example
 * const [query, findByStatus] = usePetStoreFindByStatusCached();
 * findByStatus({ params: "available" });
 *
 * @example
 * const [query, findByStatus] = usePetStoreFindByStatusCached({
 *   tags: ["my-custom-tag"],
 *   revalidate: 3600,
 * });
 * findByStatus({ params: "pending" });
 */
export const usePetStoreFindByStatusCached = (
  cacheOptions?: ServerCacheOptions
) => {
  const { query, action } = useGenericServerQueryAction<
    PetStatus,
    PetStoreFindByStatusCachedListPayload
  >(
    params => findByStatusCachedKey(params),
    params => petStoreFindByStatusCachedAction({ params, cacheOptions })
  );

  return [query, action] as const;
};
