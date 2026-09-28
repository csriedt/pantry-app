import { PagedResponse } from "@/types/service/pagedResponse";

/**
 * Convert `(page, pageSize)` to Supabase's inclusive `.range(from, to)`
 * indices. Page is 1-based.
 *
 * Centralised because `to = from + pageSize - 1` (inclusive) is
 * subtly off-by-one from what most callers guess (`from + pageSize`,
 * exclusive) — encoding it here means no listing action can get it
 * wrong twice.
 */
export const pageRange = (
  page: number,
  pageSize: number
): { from: number; to: number } => {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
};

/**
 * Wrap a mapped page of items in the `PagedResponse<T>` envelope.
 *
 * `count` comes from Supabase's `{ count: "exact" }` select — it's
 * the total across the full result set, not the page. When the
 * caller forgot to pass `{ count: "exact" }` on `.select()`, Supabase
 * hands back `null` and the fallback `items.length` at least gives a
 * sensible-looking (though wrong) total, making the mistake obvious
 * in the UI instead of a hard crash.
 */
export const pageEnvelope = <T>({
  items,
  count,
  page,
  pageSize,
}: {
  items: T[];
  count: number | null;
  page: number;
  pageSize: number;
}): PagedResponse<T> => ({
  items,
  total: count ?? items.length,
  page,
  pageSize,
});
