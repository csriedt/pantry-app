import { PetStoreFindByStatusListPayload } from "./petStoreFindByStatusListPayload";

/**
 * The cached variant of {@link PetStoreFindByStatusListPayload}. Adds a
 * `cachedAt` ISO timestamp that's stamped *inside* the cached function
 * before return — so it's frozen for the lifetime of the cache entry and
 * only refreshes when the entry is invalidated (`revalidateTag`) or
 * expires (`cacheLife`). Useful for visually confirming cache hits.
 */
export type PetStoreFindByStatusCachedListPayload =
  PetStoreFindByStatusListPayload & {
    cachedAt?: string;
  };
