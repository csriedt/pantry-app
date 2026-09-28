/**
 * Options for configuring server-side caching behavior of `'use cache'`-
 * backed actions.
 *
 * Under the `'use cache'` model the cache key is derived automatically from
 * the cached function's arguments (and any closure captures), so the legacy
 * `keyParts` field is no longer needed — different parameter values get
 * different cache entries for free.
 *
 * @property tags - Tags to attach to the cache entry via `cacheTag()`.
 *   Pass these to `revalidateTag()` from a route handler or server action
 *   to invalidate matching entries.
 * @property revalidate - Cache revalidation behaviour in **seconds**.
 *   - A number sets `cacheLife({ revalidate })`.
 *   - `false` means "never auto-revalidate; rely on tag invalidation"
 *     (mapped to the longest preset profile).
 *   - Omitted falls back to the `default` cacheLife profile.
 */
export interface ServerCacheOptions {
  tags?: string[];
  revalidate?: number | false;
}
