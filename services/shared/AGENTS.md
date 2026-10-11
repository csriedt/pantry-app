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
> layer lives in `services/supabase/` and has begun landing: the RLS client
> (`services/supabase/rlsSupabaseClient.ts`) is in place from the auth branch.
> The bypass client and `formatSupabaseError` land with the first domain
> slice. The rules below that reference those modules apply once they land.

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
  SECURITY INVOKER functions derive the user from the JWT themselves. This
  is the identity-boundary safety net: the client never passes identity, so
  the server proves it from the session token every time. (Single-user
  accounts are the v0 scope; households arrive later as a migration.)
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

## File layout for a new domain (Supabase-backed)

```
types/<domain>/<entity>.ts                   # Zod schema, TS type, mapRow helper
types/<domain>/<enum>.ts                     # Any domain-specific enums
types/<domain>/<verb>Request.ts              # Zod-validated request shape
types/<domain>/<verb>Response.ts             # Raw DB-row-based response shape
types/<domain>/<verb>Payload.ts              # GenericPayload<Response>
types/<domain>/<domain>CacheTags.ts          # Server-cache tag builders (when cached)
actions/<domain>/<verb><Thing>Action.ts      # Server action
actions/<domain>/<verb><Thing>CachedAction.ts # 'use cache' wrapper (optional)
actions/<domain>/invalidate<Thing>Action.ts  # updateTag / revalidateTag (paired)
hooks/<domain>/<domain>QueryKeys.ts          # RQ key builders (user-scoped)
hooks/<domain>/use<Verb><Thing>.ts           # React Query hook (one per action)
```

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
