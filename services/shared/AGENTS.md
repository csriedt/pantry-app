# Service-flow patterns

Anything that talks to an external service in this app — HTTP queries,
mutations, or Supabase-backed reads/writes — uses the service-flow stack.
The full boilerplate guide is in `README.md` here. Read it before adding a
new endpoint or transport feature.

## What lives here

- `client.ts`, `interceptors.ts` — the HTTP transport (native `fetch`) and the
  three default middlewares. The error contract (`FetchHttpError`,
  `formatGenericError`) lives in `lib/service/errors.ts`. Modify only for
  genuine contract changes.
- `README.md` — end-to-end walkthroughs for the two backend patterns
  (HTTP and Supabase), plus mutation/query hooks.
- **Canonical example:** the pet store sandbox (`actions/petStore/`,
  `hooks/petStore/`, `services/petStore/`, `types/petStore/`,
  `app/api/webhooks/petStore/`) is the working, tested reference for the
  HTTP-backed pattern. Copy its shape when stamping a new domain.

## Pick the pattern

> Supabase-backed is the target pattern for the production app. The Supabase
> layer lives in `services/supabase/` and is in place: the RLS client
> (`createRlsSupabaseClient()`), the trusted-key client
> (`createBypassSupabaseClient()`), and `formatSupabaseError`. For which
> reads cache and why, see ADR 0001 and Identity boundaries below.

- **Supabase-backed** — the default for anything internal to this app
  (pantry, meals, recipes, trends — everything backed by our own database).
  Server actions use `createRlsSupabaseClient()` from
  `services/supabase/rlsSupabaseClient.ts`. Skips the `services/<domain>/`
  directory entirely.
- **HTTP-backed** — only for external upstreams (payments providers,
  third-party APIs, the pet-store demo). Server actions use a
  `create<Domain>Client()` factory in `services/<domain>/`.

## Rules

- **Don't customise the generic service-flow library.** That's everything in
  `hooks/service/`, `lib/service/`, and `types/service/`. Consumer code
  goes in `actions/<domain>/`, `hooks/<domain>/`, `services/<domain>/`
  (HTTP-only), and `types/<domain>/`. Exceptions are for real, cross-domain
  gaps in the generic layer — the mutation hook's dynamic `invalidationKeys`
  and `null`-in-key-slot support both got added this way. Fix the generic
  once, don't fork it per domain.
- **Components never call server actions directly.** Every action gets
  exactly one domain hook in `hooks/<domain>/use<Verb><Thing>.ts` wrapping
  the generic hooks; the component dispatches through the hook and reads
  `isPending` from it. This is what puts toast policy, invalidation, and
  observation-scoped callbacks in one place instead of one per screen.
- **Server-side cache (`'use cache'` / `cacheTag` / `updateTag`) is enabled
  for the local/Node showcase and DISABLED for OpenNext/Cloudflare deploys.**
  `cacheComponents: true` is set in `next.config.ts`. The production
  constraint still stands — see the incident refs in
  `actions/petStore/petStoreFindByStatusCachedAction.ts`. Do not rely on
  cache primitives if the deploy target is OpenNext/CF. When a ticket
  references cache tags (e.g. `action:{org}:{actionId}`), they are
  server-side tags unless explicitly specced as client RQ keys — those live
  in a `hooks/<domain>/<domain>QueryKeys.ts` module.
- **The cache/RLS split (ADR 0001).** A plain `'use cache'` scope cannot
  call `cookies()` — Next throws — and the sanctioned workaround (resolve
  the user outside, pass the id in) cannot serve a SECURITY INVOKER RPC,
  which needs the JWT. So: **global reads** (no user rows) cache through
  the trusted client with a family tag; **user-scoped cached reads** go
  through a `_for` RPC (`get_pantry_snapshot_for(p_user_id)`) called from
  an **unexported** cached function whose only caller is the getter that
  derived the id from the verified session; **uncached reads** keep the
  RLS client with no manual scope filter — RLS already scopes them. The
  secret-key client is permitted for exactly those two uses plus system
  work (cron, webhooks, purge) — nothing else, ever.
- **`_for` RPCs stay SECURITY INVOKER** (see `lib/db/AGENTS.md`): with a
  user token RLS backstops them; with the secret key the `p_user_id`
  filter is the only gate, pinned by the RLS suite's cross-user test. No
  claim-forging wrappers — the repeated `where user_id = p_user_id` is the
  cheaper risk.
- **Server-cache tag strings come from a shared
  `types/<domain>/<domain>CacheTags.ts` module.** The cached action, the
  invalidator action, and any webhook import the same builders (family +
  per-item). Tags are exact-match labels, not hierarchical: `org:123` does
  not match `pantry:123` - attach a family tag if you need a bulk sweep.
  Never inline tag strings.
- **Route handlers and webhooks invalidate with `revalidateTag`** (they
  cannot use `updateTag`, which is server-actions only). `{ expire: 0 }`
  when the next read must be fresh; `'max'` (stale-while-revalidate) when a
  stale window is acceptable and the client re-checks (version-token
  doorbell). Tag writes are asynchronous — a same-tick read can still see
  the old entry. A warm read (`after()` + a short delay) can front-run the
  recompute; see `app/api/webhooks/petStore/warm/route.ts`.
- **New domains ship tests.** `npm test` (Vitest) must stay green. Every
  domain gets a contract suite over the FE-facing surface — tuple shape,
  dispatch, invalidation, error contract — following
  `tests/petStoreContract.test.tsx`; route/webhook handlers follow
  `tests/petStoreWebhooks.test.ts`. Engine tests change only with the
  generic layer.
- **Identity in cache keys is the user id, never anything the server
  derives.** Supabase Auth is the identity system: `auth.users.id` is the
  user id, rows are user-scoped, and `auth.uid()` resolves it from the JWT
  (see `docs/db-plan.md` §1). Short version: the client already sees the
  signed-in user id from the session, so using it for RQ cache scoping adds
  zero leakage. Server-side resolution stays server-side.
- **Every domain server action builds its client from
  `createRlsSupabaseClient()` and never takes an identity argument.** The
  session cookie carries the JWT, `auth.uid()` resolves it inside
  Postgres, and RLS gates each statement — including the RPC pair, whose
  SECURITY INVOKER functions derive the user from the JWT themselves. The
  cached-read shape is in Identity boundaries below.
- **HTTP client files export a factory function, not a module-scoped
  instance.** Cloudflare Workers isolate I/O per-request; a module-scoped
  client can leak I/O references (streams, AbortSignals) across requests
  and throw `RefcountedCanceler` cross-request errors. Shape:
  `export function create<Domain>Client() { return HttpClientFactory.createClient({...}).instance; }`.
  Consumers call the factory at the top of each server action or route
  handler.
- **The Supabase clients follow the same factory rules but are named for
  their security mode, not a domain variant.** `services/supabase/` holds
  them: `rlsSupabaseClient.ts` (`createRlsSupabaseClient()`, publishable
  key, inside RLS) today, `bypassSupabaseClient.ts`
  (`createBypassSupabaseClient()`, secret key, outside RLS) with the first
  domain slice. Fresh instance per call, `server-only`, env read inside the
  factory — identical rules to the HTTP clients. The naming differs
  deliberately: RLS vs bypass is a security boundary, not an auth posture,
  and there is exactly one Supabase backend, so a domain prefix would
  imitate a many-upstreams shape that does not exist. Pet-store-style
  `create<Domain><Variant>Client()` naming stays for HTTP upstreams.
- **Client factories that read private env vars import `"server-only"` at
  the top.** Anything not `NEXT_PUBLIC_`-prefixed (bearer tokens, API keys,
  credentials, webhook signing secrets) counts. The import throws at build
  time if the module ends up in the client bundle, matching the
  `services/supabase/*.ts` precedent. Skip on unauthorized / public-endpoint
  clients that only read `NEXT_PUBLIC_*` vars. Note: `"use server"` is NOT
  the same — that marks a file's exports as callable-from-client via RPC,
  which is wrong for a factory returning a non-serializable `HttpClient`
  instance. Two different tools; use `server-only` here.
- **Read private env vars INSIDE the factory, not at module load.** Runtime
  secrets that are missing at build time (dev laptop without prod env)
  crash Next's build-time page data collection otherwise. `NEXT_PUBLIC_*`
  vars are fine to check at module scope because they exist at build time
  by definition; secret env vars are runtime-only. Pattern: check + throw
  from inside `create<Domain>Client()`.
- **Supabase clients: two clear names, no ambiguity.**
  `createRlsSupabaseClient()` (publishable key, RLS applies) for anything
  request-scoped — see `services/supabase/rlsSupabaseClient.ts`;
  `createBypassSupabaseClient()` (secret key, RLS bypassed — lands with the
  first domain slice) for provisioning, webhooks, AI-usage logs, and writes
  to server-only / audit tables that have RLS enabled with no user policies
  (e.g. `ai_events`, `ai_reservations`). Never use the bypass client for a
  _user-facing_ read or write on a policied table — that's what RLS is for.
- **Request shapes are defined as Zod schemas** in `types/<domain>/`, with
  TypeScript types derived via `z.infer`. Validate action inputs with
  `validateInput` (`lib/service/validation.ts`) before processing —
  it returns a service-flow `GenericError` with `code: 'validation'`
  (HTTP 422) on failure.
- **Paged listings extend `PagedRequestSchema` and return
  `PagedResponse<T>`** from `types/service/`. Use `pageRange(page, pageSize)`
  and `pageEnvelope({ items, count, page, pageSize })` from
  `lib/service/paging.ts` inside the action body — encoded once so no
  listing gets the inclusive `.range(from, to)` math wrong.
- **Sparse-patch updates use inline conditional spread with `!== undefined`.**
  Every `.update()` call lists its columns explicitly — e.g.
  `...(patch.name !== undefined ? { name: patch.name } : {})`. `!== undefined`
  is load-bearing: `null`, `false`, `0`, and `""` are legitimate values that
  must still write, so never refactor to `patch.x && …` (silently breaks
  "clear this column"). Never pass raw `patch` to `.update()` either —
  JSON.stringify's undefined-stripping makes it _work_ today, but the shape
  then depends on serialisation behaviour a reader has to know, and any
  future schema field would auto-flow to the DB. Explicit fails closed on
  new fields and is greppable. Pair this with an `Object.values(patch).some(
v => v !== undefined)` guard in the Zod schema's `.refine()` so
  `{ field: undefined }` patches are rejected at the boundary.
- **DB rows go through a domain mapper** — `mapPantryItemRow`, `mapMealRow`,
  etc. — living in `types/<domain>/<entity>.ts` next to the entity type.
  The mapper drops server-only fields (`user_id`, `deleted_at`),
  narrows loose DB enums to typed unions, and freezes the wire-shape order.
  One place to change if the DB schema evolves.
- **Errors from Supabase go through `formatSupabaseError`.** Maps
  Postgrest codes (`PGRST116`, `42501`, `23505`, etc.) to the service-flow
  `NormalizedError` shape. HTTP errors (from the fetch transport) go
  through `formatGenericError`.
- **`formatGenericError` is deny-by-default** — never opt into
  `passThroughMessage` / `exposedDetails` without a specific reason, and
  prefer narrow lodash paths over broad allow-lists.
- **Boilerplate is WET on purpose.** Every domain writes ~30 files
  (request/response/payload triples per verb, one action file per verb,
  one hook file per verb, one keys module, shared entity + mapper). This
  is deliberate — every file is easy to grep, diff, and rewrite in
  isolation. Don't compress "for concision"; the shape is the value.

## Identity boundaries

Identity is resolved once per request, outside every cache scope, and
enters cached code as a plain argument. The failure mode this prevents:
**an exported server action that accepts a user id is an IDOR** — the
client gets to choose whose data comes back.

- **Cached functions cannot read cookies.** A plain `'use cache'` scope may
  not call `cookies()`, `headers()`, or `searchParams` — Next throws
  `next-request-in-use-cache`, and it passes `next build` and fails at
  request time (ADR 0001 has the references). So the session is resolved
  *outside* the cache, and the user id — stable, non-secret, long-lived —
  becomes the cache key and the RPC argument. A token cannot be: it is a
  secret stored in plain-text keys and it rotates on every refresh.
- **The resolver is `getSessionUser()`** in `services/supabase/session.ts`,
  and it is the only place a session becomes a user. It reads the cookie
  locally — the same signed JWT PostgREST already trusts — so it costs no
  network, and RLS backstops anything built on the id. Inline
  `auth.getUser()` / `getSession()` blocks in actions are drift.
- **Any cached read is two functions; the two-step action pair is what that
  looks like.** The exported action is the surface the hook calls and takes
  NO user id — it resolves the session *when the read is user-scoped*,
  then delegates. The unexported worker carries `"use cache"` +
  `cacheTag` + `cacheLife` and does the read. A global cached read
  (`listCategories`, the recipe catalog) has no identity in it at all —
  its getter is a pure pass-through and its read goes through the trusted
  client. Unexported is load-bearing — it makes the worker unreachable
  from anywhere else, so the id can only arrive from a session the server
  verified. Copy `actions/pantry/getPantrySnapshotAction.ts` (getter +
  `getPantrySnapshotCached`).
- **Identity never crosses the client boundary as data.** The client
  dispatches a zero-arg action. Hooks carry the user id only to scope React
  Query keys, and even that is handed down from the server. A user id in a
  request payload is a bug.
- **One read path per surface, chosen by what the read is.** A cached
  **user-scoped** read goes through a `_for` RPC
  (`get_pantry_snapshot_for(p_user_id)`) returning the jsonb envelope the
  Zod schema parses. A cached **global** read (`listCategories`, the recipe
  catalog) goes through the trusted client with a plain query and **no
  RPC** — the RPC earns its keep by owning row selection, and a table with
  no user rows has none to own (ADR 0001). Uncached reads use `.from()` on
  the RLS client — RLS scopes those statements, and a hand-written filter
  on top would be redundancy, not safety. An uncached read that still needs
  the session (the account summary's email) resolves it through the same
  resolver; no read takes a client-supplied id, ever.
- **RLS is the safety net, not the primary layer, for cached reads.** The
  `_for` twins stay SECURITY INVOKER, so a token call is RLS-filtered on
  top of the WHERE — a token caller asking for another user's id gets the
  empty intersection, which the RLS suite pins. Under the trusted key the
  `p_user_id` filter is the only gate; the unexported worker and the test
  are what stand behind it.
- **A cached read must throw from its scope and map errors outside.**
  Whatever a cached function *returns* is stored — so an `{ error }` payload
  returned inside a `'use cache'` scope is cached as the entry, and a
  transient failure is served for the whole `cacheLife`. An uncached read
  returns its payload directly (correct, single-function shape); converting
  one to a cached read means the two-step split plus, for user-scoped data,
  a `_for` RPC. `searchFoods` is the standing example: not cached (mixed
  global + own rows, poor hit rate, visible staleness), and marked so in
  its JSDoc rather than left as an unmarked trap.
- **Never:** an exported action taking a user id; a `_for` function that
  forges `request.jwt.claims` to delegate to the `auth.uid()` original; a
  second caller of an unexported worker; a claim that RLS replaces the
  containment. ADR 0001 names each with its reason.

## File layout for a new domain (Supabase-backed)

```
types/<domain>/<entity>.ts                   # Zod schema, TS type, mapRow helper
types/<domain>/<enum>.ts                     # Any domain-specific enums
types/<domain>/<verb>Request.ts              # Zod-validated request shape
types/<domain>/<verb>Response.ts             # Raw DB-row-based response shape
types/<domain>/<verb>Payload.ts              # GenericPayload<Response>
types/<domain>/<domain>CacheTags.ts          # Server-cache tag builders (when cached)
actions/<domain>/<verb><Thing>Action.ts      # Server action
actions/<domain>/<verb><Thing>Cached.ts      # unexported 'use cache' worker, same
                                             # file as the action (cached reads —
                                             # see Identity boundaries)
actions/<domain>/invalidate<Thing>Action.ts  # updateTag / revalidateTag (paired)
hooks/<domain>/<domain>QueryKeys.ts          # RQ key builders (user-scoped)
hooks/<domain>/use<Verb><Thing>.ts           # React Query hook (one per action)
```

The HTTP-backed layout keeps `CachedAction.ts` as an exported file — its cached
variant is a public action. A Supabase cached read's worker is private, so it
sits in the action's own file and is named for its action.

## File layout for a new domain (HTTP-backed)

```
services/<domain>/<domain>Client.ts          # HTTP client factory (per upstream API)
types/<domain>/<verb>Request.ts              # Request body (mutations)
types/<domain>/<verb>Response.ts             # Raw upstream response
types/<domain>/<verb>Payload.ts              # GenericPayload<Response>
types/<domain>/<domain>CacheTags.ts          # Server-cache tag builders (when cached)
actions/<domain>/<verb><Thing>Action.ts      # Server action
actions/<domain>/<verb><Thing>CachedAction.ts # 'use cache' wrapper (optional)
actions/<domain>/invalidate<Thing>Action.ts  # updateTag / revalidateTag (paired)
hooks/<domain>/<domain>QueryKeys.ts          # RQ key builders
hooks/<domain>/use<Verb><Thing>.ts           # React Query hook
hooks/<domain>/use<Domain>WebSocket.ts       # WebSocket hook (if applicable)
```

See `README.md` for the copy-paste templates for each shape.
