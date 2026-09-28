/**
 * Merged paging/pattern helpers: Supabase range math, the `PagedResponse`
 * envelope, and the PostgREST-safe ILIKE pattern builder.
 */

import { PagedResponse } from "@/types/service/payloads";

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

/**
 * Build a PostgREST-safe ILIKE pattern from user input, ready to
 * interpolate into a compound filter string like `.or(...)` or
 * `.and(...)`.
 *
 * Two escaping layers sit between the caller and Postgres:
 *
 * 1. **ILIKE metacharacters** — `%` and `_` are wildcards in LIKE
 *    patterns and `\` is the escape prefix. Left unescaped, a user
 *    searching for "50%" matches every row.
 * 2. **PostgREST filter syntax** — inside `.or(...)`, commas and
 *    parentheses are structural delimiters. A user searching for
 *    "Acme, Inc" would otherwise reshape the OR expression and either
 *    error out or silently change which rows match.
 *
 * We escape the LIKE metacharacters (`%`, `_`, `\`) plus the
 * PostgREST-quoted-value delimiter (`"`), then wrap the whole thing
 * in double quotes. PostgREST treats a `"..."` value as opaque, so
 * commas / parens inside the quotes are preserved literally rather
 * than parsed as structure.
 *
 * @example
 *   ilikePattern("Acme, Inc") // => `"%Acme, Inc%"`
 *   sb.from("leads")
 *     .select("*")
 *     .or(`name.ilike.${ilikePattern(q)},company.ilike.${ilikePattern(q)}`);
 */
export function ilikePattern(value: string): string {
  const escaped = value.replace(/[%_\\"]/g, "\\$&");
  return `"%${escaped}%"`;
}
