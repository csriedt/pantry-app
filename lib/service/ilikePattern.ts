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
