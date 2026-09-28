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
