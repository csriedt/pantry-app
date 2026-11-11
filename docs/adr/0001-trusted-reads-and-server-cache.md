# ADR 0001 - Trusted reads and the server cache

- **Status:** accepted (2026-10-13)
- **Domain:** service flow / database access

## Context

The whole freshness story hangs off one cached read. One `getPantry` per user, tagged
`pantry-data:<userId>`, expired by writers with `updateTag`, with the doorbell waking every
other device. Without that single cached entry, `cacheTag` and `updateTag` are dead code and
the path never runs.

The problem is the token. Every user-scoped read goes through PostgREST with the user's
token, and RLS works out who you are from that token. A `'use cache'` scope can't call
`cookies()`, and the official workaround (resolve the user outside, pass the id in) doesn't
serve a SECURITY INVOKER RPC, because that needs the JWT. So RLS needs a bearer token, and a
bearer token can't be a cache key.

## Decision

The trusted-key client (`createBypassSupabaseClient`) gets exactly two jobs. Nothing else
goes through it.

1. **Global reference reads.** Tables with no user rows, like `categories` and the recipe
   catalog. Trusted client, plain query, a family tag. There's no identity in the read, so
   there's no ownership to get wrong.

2. **User-scoped cached reads through a `_for` RPC.**
   `get_pantry_snapshot_for(p_user_id)` is the trusted twin of `get_pantry_snapshot()`. Same
   body, identity from the argument. The cached function that calls it is **unexported**,
   and the only caller is the action's getter, which takes the id from the verified session.
   That id is the cache key, and the write actions already `updateTag` the family.

The rules that keep it honest:

- `_for` RPCs stay **SECURITY INVOKER**. Called with a user token, RLS backstops them.
  Called with the secret key, the `p_user_id` filter is the only gate, which is what the
  RLS suite's cross-user test pins.
- **No claim-forging wrapper.** `get_x_for` could `set_config('request.jwt.claims', …)` and
  delegate to the `auth.uid()` original. Drier, and it would let any caller of the wrapper
  become any user. Repeating `where user_id = p_user_id` is the cheaper risk.
- **RLS stays, and stays load-bearing.** It carries writes (the invoker write intents) and
  Realtime (a subscriber only receives rows they can SELECT), and it backstops any
  token-based call of a `_for` RPC.
- **Uncached reads keep the RLS client** with no manual filter on top. RLS already scopes
  them, and a hand-written `.eq()` is redundancy, not safety.
- **`getSessionUser` is the only place a session becomes a user.** It reads the cookie
  locally, which is the same signed JWT PostgREST already trusts.

## Consequences

- The server cache is real now. `getPantrySnapshotAction` is the first cached entry, and the
  write actions' `updateTag` calls are live invalidations.
- The trust boundary is narrow and you can audit it in one place: one unexported function,
  one source for the id, one test. The drift to watch for is a second caller of a `_for`
  RPC.
- Revocation keeps the usual cache gap. A revoked user's entry survives until `cacheLife`
  expires or the tag is invalidated. The short stale on the pantry entry covers most of it,
  and RTBF's tombstone reaches other devices through the doorbell.
- Errors thrown inside a cached scope are never cached. The getter maps them through
  `formatSupabaseError` when they carry a Postgrest shape.

## Alternatives considered

- **`'use cache: private'` reads.** Legal, since private scopes may read cookies, but
  browser-only, which duplicates React Query's cache. Rejected. One client cache, not two.
- **Trusted client with hand-scoped queries.** Works, but the filter lives in application
  code with nothing enforcing it at compile time or in the database. Rejected for the RPC,
  whose scope the harness tests directly.
- **Dropping RLS entirely.** Rejected. It does real work for writes and Realtime, and its
  cost is zero.

## References

- **`use cache` → Constraints → Request-time APIs** —
  <https://nextjs.org/docs/app/api-reference/directives/use-cache#request-time-apis>:
  *"Cached functions and components cannot access runtime APIs like `cookies()`,
  `headers()`, or `searchParams`, and the restriction follows the call stack… On a
  dynamically rendered route this surfaces when the route runs, so it can pass `next build`
  and fail under `next start`. Read these values outside the cached scope and pass them as
  arguments."* (This is the line to quote for why the constraint is easy to discover late,
  and why the build is not the place to look.)
- **`use cache` → How it works → Cache keys** — a cached function's captured outer-scope
  variables become part of its cache key, so stashing the identity in module state cannot
  smuggle it into a scope.
- **`use cache` → Constraints → React.cache isolation** — *"you cannot use `React.cache` to
  pass data into a `use cache` scope."*
- **Error reference** — <https://nextjs.org/docs/messages/next-request-in-use-cache>
- **Authentication with Cache Components** —
  <https://nextjs.org/docs/app/guides/authentication-with-cache-components> (the
  session-flavoured statement of the same rule, plus the `use cache: private` escape it
  names for compliance-shaped cases)
- **Verified empirically on this project (Next 16.3.6)** — a `cookies()` call inside a
  `'use cache'` scope passes `next build` and throws `next-request-in-use-cache` at request
  time, with Next's own message prescribing the read-outside/pass-in pattern.
