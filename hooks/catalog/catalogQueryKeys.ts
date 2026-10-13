/**
 * React Query key builders for the catalog domain. Both reads are
 * user-independent (globals + the caller's own rows, resolved by RLS
 * server-side), so the only variable is the search query.
 */

const CATALOG = "catalog" as const;

export const categoriesKey = () => [CATALOG, "categories"] as const;

/** Every food-search entry for this caller — the prefix a create invalidates. */
export const foodSearchRoot = () => [CATALOG, "foods"] as const;

export const foodSearchKey = (query: string, limit: number) =>
  [CATALOG, "foods", query, limit] as const;
