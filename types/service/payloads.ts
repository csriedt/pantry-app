/**
 * Merged payload/envelope types for the service-flow stack: generic payloads,
 * paged request/response shapes, and server-cache request options.
 */

import { z } from "zod";

import { GenericErrorPayload } from "./errors";

export interface GenericPayload<T> extends GenericErrorPayload {
  data?: T;
}

/**
 * Base request shape for paged endpoints. Domain-specific list
 * requests extend this via `.extend({ ... }).strict()` — see
 * `types/actions/listActionsRequest.ts` for the extended form and
 * `types/offers/listOffersRequest.ts` for the plain form.
 *
 * Defaults: page 1, pageSize 20. `pageSize` capped at 100 so a
 * caller can't pull a whole table down accidentally.
 *
 * NB: this schema is NOT `.strict()` on purpose — strict shapes
 * can't be extended without losing the unknown-key rejection.
 * Consumers apply `.strict()` after any `.extend()` so unknown
 * keys still fail at the boundary.
 */
export const PagedRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type PagedRequest = z.infer<typeof PagedRequestSchema>;

/**
 * Generic paged-response envelope. Domain-specific list responses
 * alias to `PagedResponse<T>`, and compose extras via intersection
 * when they need to surface aggregate counts alongside the page —
 * see `ListActionsResponse` for that pattern.
 *
 * `total` is the count across the full result set (not the current
 * page) so callers can render "M of N" / pagination controls
 * without a second round-trip.
 */
export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

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

export interface GenericServerCachedRequest<T> {
  params: T;
  cacheOptions?: ServerCacheOptions;
}
