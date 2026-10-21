# Service Flow — Quick Reference

The service-flow stack is built on:

- **Native `fetch`** wrapped by `HttpClientFactory`, with a middleware
  composition model.
- **Deny-by-default error contract** — every error in the system normalises
  into `{ message, code, statusCode?, details? }`.
- **React Query** for client-side query/mutation state.
- **Next.js `'use cache'`** + `cacheTag` / `cacheLife` / `updateTag` for
  server-side caching — enabled for the local/Node showcase, parked for
  OpenNext/Cloudflare deploys (see Section C).
- **Native `WebSocket`** wrapped by `useGenericWebSocket`, with reconnect and
  message validation.

This README is the reference. Every pattern below is a complete, copy-paste
template — substitute your domain/thing names and field shapes against
them.

## 🐾 Canonical example — start here

The working, tested reference for every pattern below is the pet store
sandbox:

| Piece | Path |
| --- | --- |
| HTTP clients | `services/petStore/` |
| Actions (uncached, cached, invalidator, diagnostic) | `actions/petStore/` |
| Server-cache tag builders | `types/petStore/petStoreCacheTags.ts` |
| Hooks + RQ keys | `hooks/petStore/` |
| Webhooks (standard + warm) | `app/api/webhooks/petStore/` |
| Contract + webhook tests | `tests/petStoreContract.test.tsx`, `tests/petStoreWebhooks.test.ts` |

Copy its shape when stamping a new domain. The walkthroughs below use
invented `widgets` names to isolate each piece; the pet store is
where they come together.

## 📁 File Structure

```
services/shared/
├── client.ts                      # HTTP factory + transport (native fetch)
└── interceptors.ts                # Auth / header / error-formatting middlewares

services/<domain>/
└── <domain>Client.ts              # Client factory per upstream API
                                   # (pet store splits Unauthorized/Authorized)

actions/<domain>/
├── <thing>Action.ts               # Uncached read or write action
├── <thing>CachedAction.ts         # 'use cache' wrapper (optional)
└── invalidate<Thing>Action.ts     # updateTag / revalidateTag (paired with cached)

hooks/<domain>/
├── use<Thing>.ts                  # React Query hook over the action
├── use<Thing>Cached.ts            # Same shape over the cached action
└── use<Domain>WebSocket.ts        # WebSocket hook (if applicable)

types/<domain>/
├── <thing>Request.ts              # Request body (for mutations)
├── <thing>Response.ts             # Raw upstream response
├── <thing>Payload.ts              # Wrapped: { data?, error? }
├── <thing>CachedPayload.ts        # Payload + cachedAt (optional)
└── <domain>CacheTags.ts           # Server-cache tag builders (when cached)

types/service/                     # errors.ts · payloads.ts · http.ts
lib/service/                       # errors · validation · paging · cache · query
hooks/service/                     # query · mutate · websocket generic hooks
```

The `<domain>/<thing>` files are what you create per feature. The
`*/service/` directories are the underlying library — they don't need to
change when you add a new endpoint.

## 🚀 Quick Start — HTTP Client

### 1. Create a Simple Client

Construct clients inside the function that uses them — **never at module
scope**. Cloudflare Workers isolate I/O per-request; a shared instance can
leak I/O across requests.

```typescript
import { HttpClientFactory } from "@/services/shared/client";

export async function someServerAction() {
  const client = HttpClientFactory.createClient({
    baseURL: "https://api.example.com",
    timeout: 10000,
  }).instance;

  const { data } = await client.get("/endpoint");
  return data;
}
```

### 2. Domain-Specific Client (Recommended)

Create one client-factory per upstream API. **Export a factory function, not
a module-scoped instance** — Cloudflare Workers isolate I/O per-request; a
shared module-scoped client can leak I/O references across requests and
throw `RefcountedCanceler` cross-request errors.

```typescript
// services/myDomain/myDomainClient.ts
import { HttpClientFactory } from "@/services/shared/client";

const baseURL = process.env.NEXT_PUBLIC_MY_API_URL;
if (!baseURL) {
  throw new Error("Missing NEXT_PUBLIC_MY_API_URL in the environment.");
}

export function createMyDomainClient() {
  return HttpClientFactory.createClient({
    baseURL,
    timeout: 15000,
  }).instance;
}
```

## 🧱 Building an End-to-End Feature

### Pick the pattern

Two backend shapes:

- **Supabase-backed** — the target for anything internal to this app
  (pantry, meals, recipes, trends — everything backed by our own database).
  Identity is the session: the cookie carries the JWT, `auth.uid()`
  resolves it inside Postgres, and RLS scopes every query. The server
  action pattern is documented in **Section E** below. The Supabase layer
  has begun landing — `services/supabase/rlsSupabaseClient.ts` is in place
  from the auth branch; the bypass client and `formatSupabaseError` land
  with the first domain slice.
- **HTTP-backed** — only for external upstreams (payments, third-party
  APIs, the pet-store demo). See **Sections A–D** below for the HTTP
  patterns.

Most production tickets are Supabase-backed; in this repo the working
HTTP reference is the pet store (Sections A–D). Jump to Section E for the
target shape.

**Server-side caching (`'use cache'`) is enabled for the local/Node
showcase and parked for OpenNext/Cloudflare deploys** — OpenNext on
Cloudflare doesn't support Next's cache primitives (see incident refs in
`actions/petStore/petStoreFindByStatusCachedAction.ts`). `cacheComponents:
true` is set in `next.config.ts`. Section C below is live for local work;
do not rely on it if the deploy target is OpenNext/Cloudflare. When a
ticket references cache tags, they are server-side tags unless explicitly
specced as client RQ keys (which live in
`hooks/<domain>/<domain>QueryKeys.ts`).

### A. Read (uncached query) — HTTP

Files to create:

| Path                                | Purpose                     |
| ----------------------------------- | --------------------------- |
| `types/<domain>/<thing>Response.ts` | Raw upstream response shape |
| `types/<domain>/<thing>Payload.ts`  | Wrapped `{ data?, error? }` |
| `actions/<domain>/<thing>Action.ts` | Server action               |
| `hooks/<domain>/use<Thing>.ts`      | React Query hook            |

**Action** (server side):

```typescript
// actions/myDomain/getWidgetsAction.ts
"use server";

import { GenericError } from "@/types/service/errors";
import { getMissingEnvPayload } from "@/lib/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { WidgetListResponse } from "@/types/myDomain/widgetListResponse";
import { WidgetListPayload } from "@/types/myDomain/widgetListPayload";
import { createMyDomainClient } from "@/services/myDomain/myDomainClient";

export async function getWidgetsAction(): Promise<WidgetListPayload> {
  if (!process.env.NEXT_PUBLIC_WIDGETS_ENDPOINT) {
    return getMissingEnvPayload("NEXT_PUBLIC_WIDGETS_ENDPOINT");
  }

  let payload: WidgetListPayload | undefined;
  let error: GenericError | undefined;
  try {
    // Fresh per-request client.
    const myDomainClient = createMyDomainClient();
    const response = await myDomainClient.get<WidgetListResponse>(
      process.env.NEXT_PUBLIC_WIDGETS_ENDPOINT,
    );
    payload = { data: response.data };
  } catch (ex) {
    error = formatGenericError(ex);
  }
  return payload ?? { error };
}
```

**Hook** (client side):

```typescript
// hooks/myDomain/useGetWidgets.ts
import { getWidgetsAction } from "@/actions/myDomain/getWidgetsAction";
import { WidgetListPayload } from "@/types/myDomain/widgetListPayload";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";

export const useGetWidgets = () => {
  const { query, action } = useGenericServerQueryAction<
    void,
    WidgetListPayload
  >(
    () => ["widgets"],
    () => getWidgetsAction(),
  );
  return [query, action] as const;
};
```

**Use it from a component:**

```tsx
const [widgets, fetchWidgets] = useGetWidgets();

useEffect(() => {
  fetchWidgets({ params: undefined });
}, [fetchWidgets]);

if (widgets.isLoading) return <p>Loading…</p>;
if (widgets.error) return <p>{widgets.error.message}</p>;
return <ul>{widgets.data?.data?.map(...)}</ul>;
```

The `action`'s second-argument options accept `{ options, callbacks }` — see
`useGenericServerQueryAction` for what's available.

**Callback contract (observation-scoped).** Callbacks fire on every observed
data/error transition for the active key — the dispatch itself, mutation-driven
invalidation refetches, focus/reconnect/interval refreshes — not once per
`action()` call. Closures are captured at dispatch and reused by later
background refreshes, so read fresh state from the callback arguments (or
refs), not from captured mutable state. Query error toasts are default-on,
suppressible via `toastMessages: { error: false }`, and deduped per failure
episode (same code/message) until a success resets. Mutation error toasts fire
per dispatch — each is a deliberate user action.

### B. Write (mutation) — HTTP

Files to create:

| Path                                | Purpose                     |
| ----------------------------------- | --------------------------- |
| `types/<domain>/<thing>Request.ts`  | Request body shape          |
| `types/<domain>/<thing>Response.ts` | Raw upstream response       |
| `types/<domain>/<thing>Payload.ts`  | Wrapped `{ data?, error? }` |
| `actions/<domain>/<thing>Action.ts` | Server action               |
| `hooks/<domain>/use<Thing>.ts`      | React Query mutation hook   |

**Action**:

```typescript
// actions/myDomain/createWidgetAction.ts
"use server";

import { GenericError } from "@/types/service/errors";
import { getMissingParamPayload } from "@/lib/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { CreateWidgetRequest } from "@/types/myDomain/createWidgetRequest";
import { CreateWidgetResponse } from "@/types/myDomain/createWidgetResponse";
import { CreateWidgetPayload } from "@/types/myDomain/createWidgetPayload";
import { createMyDomainClient } from "@/services/myDomain/myDomainClient";

export async function createWidgetAction(
  input: CreateWidgetRequest,
): Promise<CreateWidgetPayload> {
  if (!input?.name) return getMissingParamPayload("name");

  let payload: CreateWidgetPayload | undefined;
  let error: GenericError | undefined;
  try {
    // Fresh per-request client.
    const myDomainClient = createMyDomainClient();
    const response = await myDomainClient.post<CreateWidgetResponse>(
      "/widgets",
      input,
    );
    payload = { data: response.data };
  } catch (ex) {
    error = formatGenericError(ex);
  }
  return payload ?? { error };
}
```

**Hook**:

```typescript
// hooks/myDomain/useCreateWidget.ts
import { CreateWidgetRequest } from "@/types/myDomain/createWidgetRequest";
import { CreateWidgetPayload } from "@/types/myDomain/createWidgetPayload";
import { createWidgetAction } from "@/actions/myDomain/createWidgetAction";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";

export const useCreateWidget = () => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    CreateWidgetRequest,
    CreateWidgetPayload
  >(
    ["create-widget"], // mutation key
    [["widgets"]], // array of key prefixes to invalidate on success
    createWidgetAction,
  );
  return [mutate, mutateAsync, isPending] as const;
};
```

**Use it from a component (per-call callbacks supported):**

```tsx
const [createWidget, , isCreating] = useCreateWidget();

createWidget(input, {
  onSuccess: (data) => /* ... */,
  onError: (error) => /* error is ExtendedApiError; .genericError holds the NormalizedError */,
  onSettled: (data, error) => /* ... */,
});
```

After a successful mutation, the hook auto-invalidates every React Query
prefix listed in its second argument (`[['widgets']]`) so any active
query hook whose key starts with one of those prefixes refetches.

### C. Cached read (`'use cache'`) — enabled locally

> **⚠️ Host-dependent.** Server-side caching works for the local/Node
> showcase (`cacheComponents: true` is set). It is parked for
> OpenNext/Cloudflare deploys — those don't support Next's cache
> primitives. See incident refs in
> `actions/petStore/petStoreFindByStatusCachedAction.ts`. If the deploy
> target cannot run `'use cache'`, skip this section and keep client-side
> RQ keys as the only cache.

Layer caching **on top of** an existing read action. The cached action wraps
the uncached one inside a `'use cache'` function. The hook is the same
shape as the uncached version — different key, different return type.

Files to create:

| Path                                          | Purpose                                         |
| --------------------------------------------- | ----------------------------------------------- |
| `types/<domain>/<thing>CachedPayload.ts`      | Payload `& { cachedAt? }` (optional but useful) |
| `actions/<domain>/<thing>CachedAction.ts`     | `'use cache'` wrapper                           |
| `actions/<domain>/invalidate<Thing>Action.ts` | `updateTag` / `revalidateTag`                   |
| `hooks/<domain>/use<Thing>Cached.ts`          | React Query hook                                |

**Cached action** (validation outer, cache inner):

```typescript
// actions/myDomain/getWidgetsCachedAction.ts
"use server";

import { applyCachePolicy } from "@/lib/service/cache";
import { getMissingParamPayload } from "@/lib/service/errors";
import { WidgetStatus } from "@/types/myDomain/widgetStatus";
import { WidgetListCachedPayload } from "@/types/myDomain/widgetListCachedPayload";
import { GenericServerCachedRequest } from "@/types/service/payloads";
import { ServerCacheOptions } from "@/types/service/payloads";

import { getWidgetsByStatusAction } from "./getWidgetsByStatusAction";

async function fetchCachedWidgets(
  status: WidgetStatus,
  cacheOptions?: ServerCacheOptions,
): Promise<WidgetListCachedPayload> {
  "use cache";
  applyCachePolicy(cacheOptions, ["widgets", `widgets-${status}`]);

  const result = await getWidgetsByStatusAction(status);
  return { ...result, cachedAt: new Date().toISOString() };
}

export async function getWidgetsCachedAction(
  request: GenericServerCachedRequest<WidgetStatus>,
): Promise<WidgetListCachedPayload> {
  if (!request.params) return getMissingParamPayload("status");
  return fetchCachedWidgets(request.params, request.cacheOptions);
}
```

**Invalidator** (server action, callable from any client component):

```typescript
// actions/myDomain/invalidateWidgetsAction.ts
"use server";

import { updateTag } from "next/cache";
import { WidgetStatus } from "@/types/myDomain/widgetStatus";

export async function invalidateWidgetsAction(
  status?: WidgetStatus,
): Promise<void> {
  if (status) updateTag(`widgets-${status}`);
  else updateTag("widgets");
}
```

For invalidation from a **route handler / webhook**, use `revalidateTag`.
Pick the profile deliberately:

- **`{ expire: 0 }`** — the next read blocks and returns fresh data. Use when
  the event means "this changed now" and the next reader must be correct.
- **`'max'`** — stale-while-revalidate: the first read is served stale and
  triggers the background recompute; the next read is fresh. Use when a short
  stale window is acceptable and the client will re-check (e.g. the
  version-token doorbell).

Tag writes are asynchronous — a read in the same tick can still see the old
entry. A **warm** read (`after()` plus a short delay) can front-run the
recompute so the first client read lands fresh; see
`app/api/webhooks/petStore/warm/route.ts`. Warm is best effort: under `'max'`
the first read after invalidation is always the trigger read.

**Hook** (note the distinct React Query key — never share with the uncached
version, or the uncached hook's mutation invalidations will flush the cached
panel's state too):

```typescript
// hooks/myDomain/useGetWidgetsCached.ts
import { WidgetStatus } from "@/types/myDomain/widgetStatus";
import { WidgetListCachedPayload } from "@/types/myDomain/widgetListCachedPayload";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { getWidgetsCachedAction } from "@/actions/myDomain/getWidgetsCachedAction";
import { ServerCacheOptions } from "@/types/service/payloads";

export const useGetWidgetsCached = (cacheOptions?: ServerCacheOptions) => {
  const { query, action } = useGenericServerQueryAction<
    WidgetStatus,
    WidgetListCachedPayload
  >(
    (params) => ["widgets-cached", params],
    (params) => getWidgetsCachedAction({ params, cacheOptions }),
  );
  return [query, action] as const;
};
```

**Payload type** (optional `cachedAt` for visibility):

```typescript
// types/myDomain/widgetListCachedPayload.ts
import { WidgetListPayload } from "./widgetListPayload";

export type WidgetListCachedPayload = WidgetListPayload & { cachedAt?: string };
```

#### Caching semantics

- `'use cache'` caches the function's return value. Cache key = function
  identity + serialised arguments + closure captures. Returning early on a
  validation error inside `'use cache'` will cache the error — that's why we
  validate in the outer non-cached function.
- `cacheTag(tag1, tag2, …)` attaches tags to the entry; used by
  `updateTag` / `revalidateTag`.
- `cacheLife(profile)` sets the entry's lifetime. Built-in profiles:
  `'seconds'`, `'minutes'`, `'hours'`, `'days'`, `'weeks'`, `'max'`.
  Pass `{ revalidate: N }` for a custom interval in seconds.
- `updateTag(tag)` (server actions only) immediately expires the tag — next
  read **blocks** for fresh data.
- `revalidateTag(tag, 'max')` (anywhere) marks stale, serves stale instantly
  on next read, refreshes in background. Better UX in production.
- `revalidateTag(tag, { expire: 0 })` — like `updateTag` but available from
  route handlers / webhooks.

`cacheComponents: true` must be set in `next.config.ts` (it is, for the
local showcase).

### D. WebSocket — HTTP

> **Parked.** WebSockets will come via Supabase Realtime (channels own
> reconnect and typing), so `useGenericWebSocket` is expected to be deleted
> rather than hardened. Use this section only if a non-Supabase socket
> actually appears.

WebSocket support is handled by `useGenericWebSocket`. Per-feature you wrap
it in a thin domain hook that supplies the URL, the message schema, and
optionally a subscribe-on-open routine.

Files to create:

| Path                                    | Purpose     |
| --------------------------------------- | ----------- |
| `hooks/<domain>/use<Thing>WebSocket.ts` | Domain hook |

**Hook**:

```typescript
// hooks/myDomain/useMyDomainStream.ts
import { z } from "zod";
import { useGenericWebSocket } from "../service/useGenericWebSocket";

const MyMessageSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
});

type MyMessage = z.infer<typeof MyMessageSchema>;

export function useMyDomainStream(channel: string) {
  const { lastMessageReceived, messageHistory, sendMessage, isOpen } =
    useGenericWebSocket<MyMessage>("wss://stream.example.com", {
      schema: MyMessageSchema,
      onOpen() {
        sendMessage({ op: "subscribe", args: [channel] });
      },
    });

  return [lastMessageReceived, messageHistory, isOpen] as const;
}
```

Notes:

- The schema validates each inbound message; invalid messages are silently
  dropped (not surfaced as errors).
- Auto-reconnect with exponential backoff is on by default. Override via
  `disableReconnect` / `reconnectDelayMs` / `maxReconnectDelayMs`.
- `messageHistory` is bounded to 100 entries by default — pass `maxHistory`
  to change.
- All callbacks (`onOpen`, `onClose`, `onError`, `onMessage`, validators) are
  mirrored into refs each render, so inline closures from the caller don't
  destabilise the socket or trigger reconnects.

### E. Supabase-backed domain

> **Partially landed.** `services/supabase/rlsSupabaseClient.ts`
> (`createRlsSupabaseClient()`) is in place from the auth branch, and
> `createBypassSupabaseClient()` / `formatSupabaseError` landed with the
> first service slice. For the cache/RLS split — which reads cache, which
> stay uncached, and why — see ADR 0001 and the stamp; the short version
> is in the read section below.

The most common shape in this project. No HTTP client, no
`services/<domain>/` directory — the server actions talk directly to
Supabase through `createRlsSupabaseClient()` and rely on the session +
RLS for scoping. There is no identity argument anywhere on the uncached
path: the session cookie carries the JWT, `auth.uid()` resolves it inside
Postgres, and RLS gates every statement. The RPC pair
(`get_pantry_snapshot`, `upsert_pantry_item`) is the pantry domain's
read/write path — one transaction per write, rows + doorbell bump — and a
plain `.from()` read is the fallback for domains without an RPC.

Files to create for a full domain (pantry shown):

| Path                                      | Purpose                                          |
| ----------------------------------------- | ------------------------------------------------ |
| `types/<domain>/<entity>.ts`              | Zod schema, TS type, and `map<Entity>Row` mapper |
| `types/<domain>/<enum>.ts`                | Any domain-specific enums (state, kind, etc.)    |
| `types/<domain>/<verb>Request.ts`         | Zod schema + inferred TS type per action         |
| `types/<domain>/<verb>Response.ts`        | Wire-shape response per action                   |
| `types/<domain>/<verb>Payload.ts`         | `GenericPayload<Response>` per action            |
| `actions/<domain>/<verb><Thing>Action.ts` | Server action per verb                           |
| `hooks/<domain>/<domain>QueryKeys.ts`     | RQ key builders (user-scoped)                   |
| `hooks/<domain>/use<Verb><Thing>.ts`      | React Query hook per action                      |

Boilerplate is WET on purpose — every file is easy to grep, diff, and
rewrite in isolation. Don't compress "for concision"; the shape is the
value.

#### Entity + mapper (`types/<domain>/<entity>.ts`)

```typescript
// types/pantry/pantryItem.ts
import { z } from "zod";

/**
 * Canonical pantry-item shape returned by the service-flow layer.
 * The snapshot RPC projects rows for display — food id, canonical name,
 * the grouping key, amount/unit or stock_state, added_at — and `user_id`
 * never leaves the DB: identity rides the session, RLS scopes the read.
 * See `lib/db/AGENTS.md` for the RPC contract.
 */
export const PantryItemSchema = z.object({
  food_id: z.string().uuid(),
  canonical_name: z.string().min(1),
  category_id: z.string().uuid().nullable(),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
  stock_state: z.enum(["stocked", "short", "out"]).nullable(),
  added_at: z.string(),
});

export type PantryItem = z.infer<typeof PantryItemSchema>;
```

The RPC returns `jsonb` — typed as `Json` in `database.types.ts`, i.e. not
statically checked. The mapper is therefore also the parse boundary: one
place validates the wire shape into the domain type.

```typescript
// types/pantry/pantrySnapshot.ts
import { z } from "zod";

import { PantryItemSchema } from "./pantryItem";

export const PantrySnapshotSchema = z.object({
  version: z.number(),
  items: z.array(PantryItemSchema),
});

export type PantrySnapshot = z.infer<typeof PantrySnapshotSchema>;
```

Where a domain has no RPC and reads through `.from()`, the mapper takes
the typed DB row instead (`Database["public"]["Tables"]["meals"]["Row"]`)
— same job: drop server-only fields (`user_id`, `deleted_at`), narrow
loose DB enums, freeze field order.

#### Read

The pantry read is the snapshot RPC — version and rows in one statement,
so the two halves of the envelope can never disagree (the client's version
compare depends on that).

```typescript
// actions/pantry/getPantrySnapshotAction.ts
"use server";

import { cacheLife, cacheTag } from "next/cache";

import { createBypassSupabaseClient } from "@/services/supabase/bypassSupabaseClient";
import { formatSupabaseError, isPostgrestError } from "@/services/supabase/formatSupabaseError";
import { getSessionUser } from "@/services/supabase/session";
import { GetPantrySnapshotPayload } from "@/types/pantry/getPantrySnapshotPayload";
import { GetPantrySnapshotResponse } from "@/types/pantry/getPantrySnapshotResponse";
import { pantryDataTag } from "@/types/pantry/pantryCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";

export async function getPantrySnapshotAction(): Promise<GetPantrySnapshotPayload> {
  let error: GenericError | undefined;
  try {
    const user = await getSessionUser();
    if (!user) {
      return { error: { message: "Not signed in.", code: "unauthorized" } };
    }
    return await getPantrySnapshotCached(user.id);
  } catch (ex) {
    error = isPostgrestError(ex)
      ? formatSupabaseError(ex, "Failed to read the pantry.")
      : formatGenericError(ex, { defaultMessage: "Failed to read the pantry." });
  }
  return { error };
}

// Unexported on purpose: the id must come from the verified session, so
// this is unreachable from anywhere else. Its argument is the cache key;
// the tag is the invalidation label.
async function getPantrySnapshotCached(userId: string): Promise<GetPantrySnapshotPayload> {
  "use cache";
  cacheTag(pantryDataTag(userId));
  cacheLife("minutes");

  const sb = createBypassSupabaseClient();
  const { data, error } = await sb.rpc("get_pantry_snapshot_for", {
    p_user_id: userId,
  });
  if (error) throw error;

  return { data: GetPantrySnapshotResponse.parse(data) };
}
```

Points worth calling out:

- **The getter/private split is the cache boundary, and nothing else.**
  The getter resolves identity from the session (the one cookie read,
  outside the cache); the private cached function takes the id, caches on
  it, and reads through the trusted client + the `_for` RPC. The id must
  arrive from a session the server verified — which is why the cached
  function is unexported and the getter is its only caller (ADR 0001, and
  the Identity boundaries section in `AGENTS.md` here).
- **Global reads need none of that.** A read with no user rows
  (`listCategories`, the recipe catalog) is a plain cached function over
  the trusted client with a family tag — no identity in the key or the
  read.
- **Uncached reads stay single functions** on the RLS client with no
  manual scope filter: RLS already scopes them, and a hand-written
  `.eq()` on top is redundancy, not safety.
- **The mapper parses, not just projects.** `rpc()` returns `Json`; the
  Zod schema in `types/pantry/` is the single boundary between the wire
  shape and the domain type.
- **`.select("*", { count: "exact" })` + `pageRange` / `pageEnvelope`**
  apply the same way for domains that page through `.from()` (meals, for
  instance). `count` is required for a correct total; the envelope's
  fallback (`items.length`) gives a visibly-wrong total otherwise.
- **`.is("deleted_at", null)`** stays the universal soft-delete filter on
  `.from()` read paths so tombstoned rows don't leak to the client.

> **Session identity: verified claims, not the cookie user object.**
> `getSessionUser()` used to return `auth.getSession().user`. That object is
> read from the cookie, is not signed, and the SDK warns against using it on
> the server. Here the id feeds the trusted `_for` RPCs and is the cache key,
> so an editable user object is not safe. The resolver now calls
> `auth.getClaims()` and returns the signed token's `sub` and `email` as
> `{ id, email? }` — not the full `User`. With this project's asymmetric
> signing keys the check is local against the SDK's JWKS cache, which is
> shared across clients in the same process/isolate and refreshed on a TTL;
> a cold instance (or a new signing key) pays the fetch. The request client
> itself is fresh by design — it closes over that request's cookies — but
> that does not make the JWKS cache per client. If claims verification fails
> (a JWKS hiccup or key rotation), it falls back to `auth.getUser()`.
> The proxy's per-request `getUser()` still owns the route gate and the
> revocation check. Use `getSession()` only when a raw access token is
> actually needed (the upstream bearer example below); never use its `user`
> object for identity. The account summary is the only caller that reads
> `email`.

#### Write (mutation)

Same shape as read — except the write path is the RPC, and the RPC *is*
the transaction. Rows and the doorbell bump land together inside Postgres,
so the version can never drift from the data. The server action wraps it
and adds `updateTag` for read-your-writes; the client never sends identity.

```typescript
// actions/pantry/upsertPantryItemAction.ts
"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { UpsertPantryItemPayload } from "@/types/pantry/upsertPantryItemPayload";
import {
  UpsertPantryItemRequest,
  UpsertPantryItemRequestSchema,
} from "@/types/pantry/upsertPantryItemRequest";
import { pantryDataTag } from "@/types/pantry/pantryCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";
import { updateTag } from "next/cache";

export async function upsertPantryItemAction(
  input: UpsertPantryItemRequest,
): Promise<UpsertPantryItemPayload> {
  const validation = validateInput(UpsertPantryItemRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb.rpc("upsert_pantry_item", {
      p_food_id: validation.data.food_id,
      p_amount: validation.data.amount ?? null,
      p_unit: validation.data.unit ?? null,
      p_stock_state: validation.data.stock_state ?? null,
    });

    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Failed to update the pantry."),
      };
    }

    // The RPC returns the new doorbell version — advance the cached copy
    // instead of re-reading. The tag is per-user, so the user id is
    // resolved from the session (never accepted from the client), and the
    // tag string comes from the shared builder, never inline.
    const user = await getSessionUser(sb);
    if (user) updateTag(pantryDataTag(user.id));
    return { data: { version: data } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Failed to update the pantry.",
    });
  }
  return { error };
}
```

- **No `user_id` on the insert — the RPC derives it from `auth.uid()`.**
  The client passes the food and its new state; identity is settled inside
  the function, where RLS also gates the write.
- **`updateTag` in the server action, `revalidateTag` in route
  handlers/webhooks** — the latter cannot call `updateTag` (server actions
  only). Both land asynchronously; a same-tick read can still see the old
  entry, which is why the client version compare exists.
- **One intent per shape.** Checkoff (pantry write + list delete + bump)
  and the meal commit stamp the same shape: one RPC returning the new
  version, wrapped by an action that invalidates.
- **Table checks are the guard, not the action.** A both-set
  amount/stock_state call fails the table's XOR check;
  `formatSupabaseError` maps `23514` to a validation-flavoured
  `NormalizedError` — the action adds no duplicate rules.
- **Soft delete, where it exists, is an `UPDATE` with `deleted_at`** —
  never `DELETE` (meals, for instance: undo is the compensating update).

#### Query keys module (`hooks/<domain>/<domain>QueryKeys.ts`)

```typescript
// hooks/pantry/pantryQueryKeys.ts

const PANTRY = "pantry" as const;

export const pantryRoot = (userId: string | null) => [PANTRY, userId] as const;

export const pantrySnapshotKey = (userId: string | null) =>
  [PANTRY, userId, "snapshot"] as const;
```

- **`userId` is the Supabase user id** (`auth.uid()`'s subject — the
  `auth.users.id` identity), handed down from the server: a server
  component resolves it from the session and passes it to client
  components, since there is no client-side auth SDK in this app.
  Never a server-derived value computed on the client.
- All entries sit under `[PANTRY, userId]`, so a single
  `invalidateQueries({ queryKey: [PANTRY, userId] })` on write flushes
  every pantry entry for that user.
- Keys are flat arrays of primitives — that keeps structural prefix
  matching working at any depth (`[PANTRY, userId, "snapshot"]` matches
  the snapshot; adding a segment narrows further).
- **The doorbell version never enters a key.** The version is the
  freshness token inside cached data and responses, not part of
  identity; putting it in keys would accumulate entries instead of
  invalidating them.

#### Hooks

The query hook passes a single `getQueryKey(params) => readonly unknown[]`
callback to `useGenericServerQueryAction`. Wire it to the builder so the
builder is the only place the key shape is defined — no chance for the
hook and the invalidation builder to drift.

```typescript
// hooks/pantry/usePantrySnapshot.ts
import { getPantrySnapshotAction } from "@/actions/pantry/getPantrySnapshotAction";
import { GetPantrySnapshotPayload } from "@/types/pantry/getPantrySnapshotPayload";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { pantrySnapshotKey } from "./pantryQueryKeys";

export const usePantrySnapshot = (userId: string | null) => {
  const { query, action } = useGenericServerQueryAction<
    Record<string, never>,
    GetPantrySnapshotPayload
  >(() => pantrySnapshotKey(userId), getPantrySnapshotAction);

  return [query, action] as const;
};
```

```typescript
// hooks/pantry/useUpsertPantryItem.ts
import { upsertPantryItemAction } from "@/actions/pantry/upsertPantryItemAction";
import { UpsertPantryItemPayload } from "@/types/pantry/upsertPantryItemPayload";
import { UpsertPantryItemRequest } from "@/types/pantry/upsertPantryItemRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { pantryRoot } from "./pantryQueryKeys";

export const useUpsertPantryItem = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    UpsertPantryItemRequest,
    UpsertPantryItemPayload
  >(["pantry", "upsert"], [pantryRoot(userId)], upsertPantryItemAction);

  return [mutate, mutateAsync, isPending] as const;
};
```

- **`userId ?? null` in the key slot.** `null` while the session is
  unresolved; the cached entry is scoped to "no user yet" and RLS still
  gates the server read, so a flashed cache entry can never carry another
  user's data.
- **`useGenericServerMutateAction`'s second arg is an array of
  prefixes**, not a single prefix. `[pantryRoot(userId)]` is one prefix
  wrapped in the outer array; add more prefixes to invalidate multiple
  key families. Pass a function `(data) => [...]` for response-aware
  invalidation (e.g. add the meals family only when the response carries
  a meal). See the shape in
  [Multi-key invalidation](#multi-key-invalidation-dynamic) below.

#### Multi-key invalidation (dynamic)

When a mutation touches related entities, invalidate multiple key
families. The mutation hook accepts either a static `readonly QueryKey[]`
or a function of the response:

```typescript
// hooks/meals/useCommitMeal.ts — two key families from one mutation
import { commitMealAction } from "@/actions/meals/commitMealAction";
import { CommitMealPayload } from "@/types/meals/commitMealPayload";
import { CommitMealRequest } from "@/types/meals/commitMealRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { mealsRoot, pantryRoot } from "./queryKeys";

export const useCommitMeal = (userId: string | null) => {
  const user = userId ?? null;

  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    CommitMealRequest,
    CommitMealPayload
  >(
    ["meals", "commit"],
    // A meal commit deducts pantry stock and lands a meal row — both
    // families invalidate, always.
    [pantryRoot(user), mealsRoot(user)],
    commitMealAction,
  );

  return [mutate, mutateAsync, isPending] as const;
};
```

- Always invalidates both roots (covers list/snapshot/detail).
- When invalidation should be response-aware, pass a function
  `(data) => [...]` instead of the static array and push the extra prefix
  only when the response carries it (e.g. the recipe detail family when a
  commit references a recipe the UI is showing).

## 🛡 Error Formatting (deny-by-default)

Every error in the system passes through `formatGenericError`, which
produces a `NormalizedError`:

```typescript
interface NormalizedError {
  message: string; // safe defaultMessage unless passThroughMessage opts in
  code: ErrorCode; // stable enum — never an upstream string
  statusCode?: number; // HTTP status if inferable
  details?: Record<string, unknown>; // only if exposedDetails opts in
}
```

With no `errorConfig`, the formatter emits only `{ message, code, statusCode? }`
— never stacks, never raw upstream response bodies, never arbitrary error
fields. To surface anything more, opt in explicitly:

```typescript
export function createExampleClient() {
  return HttpClientFactory.createClient({
    baseURL: "https://api.example.com",
    errorConfig: {
      defaultMessage: "Request failed",
      // Surface error.message verbatim (use only with curated upstreams):
      passThroughMessage: true,
      // Pull specific fields into `details` via lodash paths:
      exposedDetails: ["body.code", { key: "body.requestId", as: "requestId" }],
    },
  }).instance;
}
```

Per-request `errorConfig` overrides per-client defaults. To inspect the
emitted shape end-to-end, point an action at a known-404 path with no
`errorConfig` and log the returned `error` field — that's the literal
output the contract guarantees.

## 🔐 Authentication Patterns

> **Any client factory that reads private env vars must `import "server-only";`
> at the top.** Bearer tokens, API keys, credentials, signing secrets —
> anything not `NEXT_PUBLIC_`-prefixed. The import throws at build time if the
> module ends up in the client bundle, matching the
> `services/supabase/*.ts` precedent. `"use server"` is NOT a substitute —
> that marks a file's exports as callable-from-client via RPC, which is wrong
> for a factory returning a non-serializable `HttpClient`. Skip only on
> unauthorized / public-endpoint clients that read `NEXT_PUBLIC_*` alone.
>
> **Read the private env var inside the factory, not at module load.** Missing
> runtime secrets otherwise crash Next's build-time page data collection.
> `NEXT_PUBLIC_*` vars are fine to validate at module scope (they exist at
> build time by definition).

```typescript
import "server-only";

import { HttpClientFactory } from "@/services/shared/client";
import { createAuthInterceptor } from "@/services/shared/interceptors";

// Pattern 1: Static API Key (service-to-service)
export function createApiKeyClient() {
  return HttpClientFactory.createClient({
    baseURL: "https://api.example.com",
    headers: { "X-API-Key": process.env.API_KEY || "" },
  }).instance;
}

// Pattern 2: Basic Auth (username/password)
export function createBasicAuthClient() {
  return HttpClientFactory.createClient({
    baseURL: "https://api.example.com",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.API_USERNAME || ""}:${process.env.API_PASSWORD || ""}`,
      ).toString("base64")}`,
    },
  }).instance;
}

// Pattern 3: Bearer Token (dynamic, runs before each request) — e.g. an
// upstream that needs its own token, minted from this app's session.
export function createBearerClient() {
  return HttpClientFactory.createClient({
    baseURL: "https://api.example.com",
    requestMiddleware: [
      createAuthInterceptor(async () => {
        const { createRlsSupabaseClient } = await import(
          "@/services/supabase/rlsSupabaseClient"
        );
        const sb = await createRlsSupabaseClient();
        const { data } = await sb.auth.getSession();
        return data.session?.access_token ?? null;
      }),
    ],
  }).instance;
}
```

## 📦 Request bodies & Content-Type

Headers merge factory defaults → per-call overrides → body-based defaults
(only if absent). So setting `Content-Type` in a per-call `headers` config
always wins, and the body type drives serialisation.

**Vendor JSON variant** (e.g. `application/vnd.api+json`, HAL):

```typescript
client.post("/resource", payload, {
  headers: { "Content-Type": "application/vnd.api+json" },
});
// Body is still JSON-encoded; Content-Type is the override.
```

**XML / plain text** — pre-serialise as a string:

```typescript
client.post("/endpoint", '<?xml version="1.0"?>...', {
  headers: { "Content-Type": "application/xml" },
});
```

**Form-urlencoded** — pass `URLSearchParams`:

```typescript
client.post("/login", new URLSearchParams({ user: "x", pass: "y" }));
// fetch sets Content-Type: application/x-www-form-urlencoded
```

**Multipart file upload** — pass `FormData`:

```typescript
const fd = new FormData();
fd.append("file", file);
client.post("/upload", fd);
// fetch sets Content-Type: multipart/form-data with boundary
```

**Binary payload** — pass a `Blob` or `ArrayBuffer`:

```typescript
client.post("/blob", new Blob([data]), {
  headers: { "Content-Type": "application/octet-stream" },
});
```

Two rules:

1. **Body type drives serialisation, not Content-Type.** A plain object is
   always JSON-stringified regardless of the Content-Type header. If you
   need a non-JSON wire format, pre-serialise to a string (or use one of
   the typed body shapes above).
2. **`fetch`'s built-in auto-headers win when no override is set.**
   `FormData`, `URLSearchParams`, and `Blob` get the correct Content-Type
   automatically (including the multipart boundary). The factory's
   `application/json` default only kicks in for plain objects when no
   header is already set.

## 🧩 Custom Middleware

```typescript
export function createCustomClient() {
  return HttpClientFactory.createClient({
    baseURL: "https://api.example.com",
    requestMiddleware: [
      async (req) => {
        const headers = new Headers(req.headers);
        headers.set("X-Request-ID", crypto.randomUUID());
        return new Request(req, { headers });
      },
    ],
    responseMiddleware: [
      (res) => {
        console.log("Response:", res.status);
        return res;
      },
    ],
  }).instance;
}
```

The built-in error-formatting middleware is always appended **after** any
consumer response middleware, so you can pre-process the response (logging,
metrics, retry decisions) before it gets converted into a thrown
`NormalizedError`.

## 💡 Best Practices

1. **One client factory per upstream API, called per-request.** Export a
   `create<Domain>Client()` function from `services/<domain>/`; call it at
   the top of each server action or route handler. Never store the returned
   instance at module scope — Cloudflare Workers isolate I/O per-request.
2. **Use the deny-by-default error contract as the surface.** Only opt into
   `passThroughMessage` / `exposedDetails` when you actually need to surface
   upstream data; prefer narrow allow-listed lodash paths over broad ones.
3. **Cached and uncached hooks should use different React Query keys.**
   Otherwise the mutation's invalidation logic will flush both, defeating
   the cached version's purpose.
4. **Validate outside `'use cache'`.** Anything inside the cached function
   gets cached against its arguments — including error responses. Validate
   in the outer non-cached server action.
5. **Pass identity as arguments to cached functions.** `cookies()` / `headers()`
   / `auth()` are not callable inside `'use cache'`. Resolve them outside
   and pass values in.
6. **Tag per-tenant data with tenant-prefixed tags.** `revalidateTag('pets')`
   would otherwise blow away every tenant's cache.
7. **Store tokens securely.** HTTP-only cookies or server-side sessions —
   never localStorage.

## 🐛 Troubleshooting

**Auth token not being added?**

- Ensure `createAuthInterceptor` is in `requestMiddleware`
- Verify the token provider function returns a string, not `undefined`
- Check middleware order — auth typically runs first

**Need cross-request abort (client-side use)?**

- Set `enableAbortController: true` on the factory config (default is `false`
  because the module-scoped AbortController pattern leaks I/O across
  requests in Cloudflare Workers).
- Because clients are created per-request, opting in is safe: the
  AbortController lives entirely inside the request that created it.
- Server-side you rarely need this — server actions and route handlers are
  request-scoped by nature. It's really only useful for client-component
  code that wants to cancel outstanding fetches on navigation.

**`RefcountedCanceler` / "Cannot perform I/O on behalf of a different
request" errors?**

- You've cached a client (or something that captures I/O) at module scope.
  Move client construction inside the function that uses it, matching the
  `create<Domain>Client()` factory pattern.
- Useful for SSR or when timeout is enforced elsewhere

**Want to inspect the actual error shape that reaches the client?**

- Build a small action that hits a known-404 endpoint with no `errorConfig`
  and log the returned `error` field. Network-off testing produces
  `code: 'transport'`. With no opt-ins, only `message`, `code`, and
  optionally `statusCode` should appear — anything else is a contract
  violation.

**Cached action isn't returning cached data?**

- Confirm `cacheComponents: true` in `next.config.ts`
- Watch for arguments being recreated each call — the cache key is the
  serialised arguments, so a different object identity with identical
  contents still hits the same entry (serialisation is content-based)
- Server logs show the upstream call firing on cache misses; absence of
  that log on a hit confirms caching is working
- If the displayed data is changing on every refetch but the upstream
  isn't being called, look at React Query's client-side cache instead

**Want the cached action's `cachedAt` to advance immediately on
invalidate?**

- Use `updateTag(tag)` from the invalidator (server-actions only) — next
  read blocks for fresh data
- Don't use `revalidateTag(tag, 'max')` for this — it serves stale on the
  next read and only refreshes in the background, so `cachedAt` only
  advances on the read _after_ that
