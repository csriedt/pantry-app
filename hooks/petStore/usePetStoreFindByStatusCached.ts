/// TODO: re-enable this if server-side cache on Cloudflare via OpenNext is resolved or hosting moves to Vercel. See https://github.com/vercel/next.js/issues/94880, https://github.com/better-auth/better-auth/issues/10103, https://github.com/opennextjs/opennextjs-cloudflare/issues/1062 for related cache issues currently present in Next/OpenNext in this context.

// import { petStoreFindByStatusCachedAction } from "@/actions/petStore/petStoreFindByStatusCachedAction";
// import { PetStatus } from "@/types/petStore/petStatus";
// import { PetStoreFindByStatusCachedListPayload } from "@/types/petStore/petStoreFindByStatusCachedListPayload";
// import { ServerCacheOptions } from "@/types/service/serverCacheOptions";
// import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
//
// The cached hook would add its own keys module (e.g.
// `findByStatusCachedKey(status)`) rather than sharing `findByStatusKey`
// so uncached and cached entries don't collide in RQ's cache.

// /**
//  * React hook for querying pets by status with server-side caching.
//  *
//  * Wraps `petStoreFindByStatusCachedAction` with React Query for client-side state management.
//  * The server action caches API responses via the `'use cache'` directive, so frequent
//  * client-side polling does not over-hit the upstream API.
//  *
//  * Uses the React Query key prefix `['find-by-status-cached']` so it doesn't collide
//  * with the non-cached `usePetStoreFindByStatus` hook (which uses `['find-by-status']`
//  * and is invalidated by `useCreatePet` on success). The cached hook's client cache is
//  * orthogonal — server-side invalidation flows through `cacheTag` / `revalidateTag`.
//  *
//  * @param cacheOptions - Optional server cache configuration passed to every query.
//  *                       Overrides the default tags / revalidate behaviour.
//  *
//  * @returns A tuple `[queryState, actionDispatcher]`:
//  *   - `queryState`: React Query state (`data`, `error`, `isLoading`, ...). The data
//  *     includes a `cachedAt` ISO timestamp set inside the cached function — frozen on
//  *     cache hits, refreshed on misses.
//  *   - `actionDispatcher`: Function to trigger the query with a status parameter.
//  *
//  * @example
//  * // Basic usage with default cache options
//  * const [query, findByStatus] = usePetStoreFindByStatusCached();
//  * findByStatus({ params: 'available' });
//  *
//  * @example
//  * // With custom cache options
//  * const [query, findByStatus] = usePetStoreFindByStatusCached({
//  *   tags: ['my-custom-tag'],
//  *   revalidate: 3600,
//  * });
//  * findByStatus({ params: 'pending' });
//  */
// export const usePetStoreFindByStatusCached = (
//   cacheOptions?: ServerCacheOptions
// ) => {
//   const { query, action } = useGenericServerQueryAction<
//     PetStatus,
//     PetStoreFindByStatusCachedListPayload
//   >(
//     params => ["find-by-status-cached", params],
//     params => petStoreFindByStatusCachedAction({ params, cacheOptions })
//   );

//   return [query, action] as const;
// };
