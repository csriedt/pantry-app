# ADR 0001 — Trusted reads and the server cache

- **Status:** accepted (2026-10-13)
- **Domain:** service flow / database access

## Context

The freshness mechanism puts the version read *inside* a
server-cached compute: one cached `getPantry` per user, tagged
`pantry-data:<userId>`, expired by writers with `updateTag`, and the
doorbell waking every other device. Without a single server-cached entry,
`cacheTag` / `updateTag` are dead code and that read path never runs.

The obstacle: every user-scoped read goes through PostgREST with the
user's token, and RLS derives identity from that token. A plain `'use
cache'` scope may not call `cookies()` — and the sanctioned workaround
(resolve the user outside, pass the id in) cannot serve a SECURITY INVOKER
RPC, which needs the JWT. In one line: **RLS needs a bearer token, bearer
tokens must not be cache keys.**

## Decision

The trusted-key client (`createBypassSupabaseClient`) is permitted for
exactly two uses, and nothing else:

1. **Global reference reads** — tables with no user rows (`categories`,
   the recipe catalog). Trusted client, plain query, a family tag. No
   identity exists in the read, so there is no ownership to get wrong.
2. **User-scoped cached reads via a `_for` RPC** —
   `get_pantry_snapshot_for(p_user_id)` is the trusted-callable twin of
   `get_pantry_snapshot()`: same body, identity from the argument. The
   cached function that calls it is **unexported**, and the only caller is
   the action's getter, which derives the id from the verified session.
   The id is the cache key; the write actions already `updateTag` the
   family.

Supporting rules:

- `_for` RPCs stay **SECURITY INVOKER**. Called with a user token, RLS
  backstops them; called with the secret key, the `p_user_id` filter is
  the only gate — which is what the RLS suite's cross-user test pins.
- **No claim-forging wrapper.** `get_x_for` could `set_config
  ('request.jwt.claims', …)` and delegate to the `auth.uid()` original —
  drier, and it would let any caller of the wrapper become any user. The
  repeated `where user_id = p_user_id` is the cheaper risk.
- **RLS is retained, not relaxed.** It stays load-bearing for writes (the
  invoker write intents) and for Realtime (a subscriber only receives rows
  they can SELECT), and it is the backstop for any token-based call of a
  `_for` RPC.
- **Uncached reads keep the RLS client** with no manual scoping filter —
  RLS already scopes them, and a hand-written `.eq()` on top would be
  redundancy, not safety.
- The session resolver (`getSessionUser`) is the single place a session
  becomes a user; it reads the cookie locally — the same signed JWT
  PostgREST already trusts.

## Consequences

- The server cache is real: `getPantrySnapshotAction` is the first cached
  entry, and the write actions' `updateTag` calls become live
  invalidations.
- The new trust boundary is narrow and auditable: one unexported
  function, one id source, one test. A second caller of a `_for` RPC is
  the drift to watch for; the ADR names it.
- Revocation has the generic cache gap: a revoked user's entry survives
  until `cacheLife` expires or the tag is invalidated. Mitigated by the
  short stale on the pantry entry and by RTBF's tombstone reaching other
  devices through the doorbell.
- Errors thrown inside a cached scope are never cached; the getter maps
  them through `formatSupabaseError` when they carry a Postgrest shape.

## Alternatives considered

- **`'use cache: private'` reads** — legal (private scopes may read
  cookies) but browser-only, duplicating React Query's cache. Rejected:
  one client cache, not two.
- **Trusted client with hand-scoped queries** — works, but the filter
  lives in application code with no compile-time or database enforcement.
  Rejected in favour of the RPC, whose scope the harness tests directly.
- **Dropping RLS entirely** — rejected: it does real work for writes and
  Realtime, and its cost is zero.

## References

- **`use cache` → Constraints → Request-time APIs** —
  <https://nextjs.org/docs/app/api-reference/directives/use-cache#request-time-apis>:
  *"Cached functions and components cannot access runtime APIs like
  `cookies()`, `headers()`, or `searchParams`, and the restriction follows
  the call stack… On a dynamically rendered route this surfaces when the
  route runs, so it can pass `next build` and fail under `next start`.
  Read these values outside the cached scope and pass them as
  arguments."* (This is the line to quote for why the constraint is easy
  to discover late — and why the build is not the place to look.)
- **`use cache` → How it works → Cache keys** — a cached function's
  captured outer-scope variables become part of its cache key, so stashing
  the identity in module state cannot smuggle it into a scope.
- **`use cache` → Constraints → React.cache isolation** — *"you cannot use
  `React.cache` to pass data into a `use cache` scope."*
- **Error reference** — <https://nextjs.org/docs/messages/next-request-in-use-cache>
- **Authentication with Cache Components** —
  <https://nextjs.org/docs/app/guides/authentication-with-cache-components>
  (the session-flavoured statement of the same rule, plus the
  `use cache: private` escape it names for compliance-shaped cases)
- **Verified empirically on this project (Next 16.3.6)**: a `cookies()`
  call inside a `'use cache'` scope passes `next build` and throws
  `next-request-in-use-cache` at request time, with Next's own message
  prescribing the read-outside/pass-in pattern.
