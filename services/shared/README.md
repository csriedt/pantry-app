# Service Flow — Quick Reference

The service-flow stack is built on:

- **Native `fetch`** wrapped by `HttpClientFactory`, with a middleware
  composition model.
- **Deny-by-default error contract** — every error in the system normalises
  into `{ message, code, statusCode?, details? }`.
- **React Query** for client-side query/mutation state.
- **Next.js `'use cache'`** + `cacheTag` / `cacheLife` / `updateTag` for
  server-side caching.
- **Native `WebSocket`** wrapped by `useGenericWebSocket`, with reconnect and
  message validation.

This README is the reference. Every pattern below is a complete, copy-paste
template — substitute your domain/thing names and field shapes against
them.

## 📁 File Structure

```
services/shared/
├── httpClientFactory.ts           # Main HTTP factory
├── fetchHttpError.ts              # Error raised on !res.ok
├── createAuthInterceptor.ts       # Authorization request middleware
├── createHeaderInterceptor.ts     # Static-header request middleware
└── createErrorInterceptor.ts      # Error-formatting response middleware (auto-applied)

services/<domain>/
├── <domain>UnauthorizedClient.ts  # Domain HTTP client (one per upstream API)
└── <domain>AuthorizedClient.ts    # Same shape with auth middleware

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
└── <thing>CachedPayload.ts        # Payload + cachedAt (optional)

types/service/                     # Generic service-flow types — don't customise
lib/service/                     # Generic helpers — don't customise
hooks/service/                     # Generic React hooks — don't customise
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
import { HttpClientFactory } from "@/services/shared/httpClientFactory";

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
import { HttpClientFactory } from "@/services/shared/httpClientFactory";

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

- **Supabase-backed** — the default for anything internal to this app
  (offers, actions, leads, campaigns, and everything in the GTM domain).
  RLS scopes queries by workspace; the server action pattern is
  documented in **Section E** below.
- **HTTP-backed** — only for external upstreams (payments, third-party
  APIs, the pet-store demo). See **Sections A–D** below for the HTTP
  patterns.

Most new tickets in this project are Supabase-backed. Jump to Section E
unless the ticket explicitly refers to an external HTTP upstream.

**Server-side caching (`'use cache'`) is DISABLED** — OpenNext on
Cloudflare doesn't support Next's cache primitives (see incident refs in
`actions/petStore/petStoreFindByStatusCachedAction.ts`). Section C below
is kept for future reference only; do not implement it. Tickets that
reference cache tags are speccing client-side RQ keys — build them in a
`hooks/<domain>/<domain>QueryKeys.ts` module.

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

import { GenericError } from "@/types/service/genericError";
import { getMissingEnvPayload } from "@/lib/service/getMissingEnvPayload";
import { formatGenericError } from "@/lib/service/formatGenericError";
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

import { GenericError } from "@/types/service/genericError";
import { getMissingParamPayload } from "@/lib/service/getMissingParamPayload";
import { formatGenericError } from "@/lib/service/formatGenericError";
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

### C. Cached read (`'use cache'`) — DISABLED

> **⚠️ Do not implement.** Server-side caching is disabled in this
> project — OpenNext on Cloudflare doesn't support Next's cache
> primitives. See incident refs in
> `actions/petStore/petStoreFindByStatusCachedAction.ts`. Tickets that
> reference cache tags are speccing client-side RQ keys; build those in
> `hooks/<domain>/<domain>QueryKeys.ts` and skip this section entirely.
>
> This section is kept as reference for the future — if hosting moves
> away from Cloudflare or OpenNext support lands, this is what to build.

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

import { applyCachePolicy } from "@/lib/service/applyCachePolicy";
import { getMissingParamPayload } from "@/lib/service/getMissingParamPayload";
import { WidgetStatus } from "@/types/myDomain/widgetStatus";
import { WidgetListCachedPayload } from "@/types/myDomain/widgetListCachedPayload";
import { GenericServerCachedRequest } from "@/types/service/genericServerCachedRequest";
import { ServerCacheOptions } from "@/types/service/serverCacheOptions";

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

For invalidation from a **route handler / webhook**, use
`revalidateTag(tag, 'max')` (stale-while-revalidate, recommended) or
`revalidateTag(tag, { expire: 0 })` (immediate purge). See the
`updateTag` vs `revalidateTag` notes in [Caching semantics](#caching-semantics).

**Hook** (note the distinct React Query key — never share with the uncached
version, or the uncached hook's mutation invalidations will flush the cached
panel's state too):

```typescript
// hooks/myDomain/useGetWidgetsCached.ts
import { WidgetStatus } from "@/types/myDomain/widgetStatus";
import { WidgetListCachedPayload } from "@/types/myDomain/widgetListCachedPayload";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { getWidgetsCachedAction } from "@/actions/myDomain/getWidgetsCachedAction";
import { ServerCacheOptions } from "@/types/service/serverCacheOptions";

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

`cacheComponents: true` must be set in `next.config.ts` (already enabled in
this repo).

### D. WebSocket — HTTP

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

The most common shape in this project. No HTTP client, no `services/<domain>/`
directory — the server actions talk directly to Supabase via
`createRlsSupabaseClient()` and rely on RLS + `requireWorkspace()` for
scoping.

Files to create for a full CRUD domain (offers, actions, leads, etc.):

| Path                                      | Purpose                                          |
| ----------------------------------------- | ------------------------------------------------ |
| `types/<domain>/<entity>.ts`              | Zod schema, TS type, and `map<Entity>Row` mapper |
| `types/<domain>/<enum>.ts`                | Any domain-specific enums (state, kind, etc.)    |
| `types/<domain>/<verb>Request.ts`         | Zod schema + inferred TS type per action         |
| `types/<domain>/<verb>Response.ts`        | Wire-shape response per action                   |
| `types/<domain>/<verb>Payload.ts`         | `GenericPayload<Response>` per action            |
| `actions/<domain>/<verb><Thing>Action.ts` | Server action per verb                           |
| `hooks/<domain>/<domain>QueryKeys.ts`     | RQ key builders (org-scoped)                     |
| `hooks/<domain>/use<Verb><Thing>.ts`      | React Query hook per action                      |

Boilerplate is WET on purpose — every file is easy to grep, diff, and
rewrite in isolation. Don't compress "for concision"; the shape is the
value.

#### Entity + mapper (`types/<domain>/<entity>.ts`)

```typescript
// types/offers/offer.ts
import { z } from "zod";
import type { Database } from "@/lib/db/database.types";
import { OfferType, OfferTypeSchema } from "./offerType";

/**
 * Canonical Offer shape returned by the service-flow layer.
 * `deleted_at` / `workspace_id` are dropped by the mapper — RLS
 * scopes queries and soft-deleted rows are already filtered out.
 * See CLAUDE.md "Identity boundaries".
 */
export const OfferSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  pricing_model: z.string().nullable(),
  target_audience: z.string().nullable(),
  offer_type: OfferTypeSchema.nullable(),
  created_at: z.string(),
});

export type Offer = z.infer<typeof OfferSchema>;

type OfferRow = Database["public"]["Tables"]["offers"]["Row"];

/**
 * Project an `offers` DB row into the wire `Offer` shape. One place
 * drops server-only fields, narrows loose DB enums, and freezes field
 * order. Touch this and nothing else if the schema evolves.
 */
export function mapOfferRow(row: OfferRow): Offer {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    pricing_model: row.pricing_model,
    target_audience: row.target_audience,
    offer_type: row.offer_type as OfferType | null,
    created_at: row.created_at,
  };
}
```

#### Paged read (list)

Every listing follows the same shape: `requireWorkspace<T>()` at the
top, filter + order + `pageRange`, `mapOfferRow` over the rows,
`pageEnvelope` around the result.

```typescript
// types/offers/listOffersRequest.ts
import { PagedRequestSchema } from "../service/pagedRequest";
import { z } from "zod";

export const ListOffersRequestSchema = PagedRequestSchema.strict();
export type ListOffersRequest = z.infer<typeof ListOffersRequestSchema>;
```

```typescript
// types/offers/listOffersResponse.ts
import { PagedResponse } from "../service/pagedResponse";
import { Offer } from "./offer";

export type ListOffersResponse = PagedResponse<Offer>;
```

```typescript
// actions/offers/listOffersAction.ts
"use server";

import { formatSupabaseError } from "@/lib/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/lib/supabase/rlsSupabaseClient";
import { ListOffersPayload } from "@/types/offers/listOffersPayload";
import {
  ListOffersRequest,
  ListOffersRequestSchema,
} from "@/types/offers/listOffersRequest";
import { ListOffersResponse } from "@/types/offers/listOffersResponse";
import { mapOfferRow } from "@/types/offers/offer";
import { GenericError } from "@/types/service/genericError";
import { formatGenericError } from "@/lib/service/formatGenericError";
import { pageEnvelope, pageRange } from "@/lib/service/paging";
import { requireWorkspace } from "@/lib/service/requireWorkspace";
import { validateInput } from "@/lib/service/validateInput";

export async function listOffersAction(
  input: ListOffersRequest,
): Promise<ListOffersPayload> {
  const validation = validateInput(ListOffersRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  const { page, pageSize } = validation.data;
  const { from, to } = pageRange(page, pageSize);

  let error: GenericError | undefined;
  try {
    const workspace = await requireWorkspace<ListOffersResponse>();
    if (!workspace.success) return workspace.payload;

    const sb = await createRlsSupabaseClient();
    const {
      data,
      error: sbError,
      count,
    } = await sb
      .from("offers")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (sbError) {
      return { error: formatSupabaseError(sbError, "Failed to list offers.") };
    }

    const items = (data ?? []).map(mapOfferRow);
    return { data: pageEnvelope({ items, count, page, pageSize }) };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Failed to list offers.",
    });
  }
  return { error };
}
```

Points worth calling out:

- **`requireWorkspace<TResponse>()`** is the identity-boundary safety
  net. The client passes only the Clerk org id in cache keys — the
  server must independently resolve identity from the session and
  reject explicitly on null. See CLAUDE.md "Identity boundaries".
- **`.select("*", { count: "exact" })`** is required for `pageEnvelope`
  to have a total. Forget it and `count` is `null`; the envelope's
  fallback (`items.length`) will give a visibly-wrong total, which is
  easy to spot in the UI.
- **`.is("deleted_at", null)`** is the universal soft-delete filter for
  read paths. Every listing / detail / update guards on this so
  tombstoned rows don't leak back into the client.

#### Write (mutation)

Same shape as read, plus `workspace.workspaceId` on the insert.

```typescript
// actions/offers/createOfferAction.ts
"use server";

import { formatSupabaseError } from "@/lib/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/lib/supabase/rlsSupabaseClient";
import { CreateOfferPayload } from "@/types/offers/createOfferPayload";
import {
  CreateOfferRequest,
  CreateOfferRequestSchema,
} from "@/types/offers/createOfferRequest";
import { CreateOfferResponse } from "@/types/offers/createOfferResponse";
import { mapOfferRow } from "@/types/offers/offer";
import { GenericError } from "@/types/service/genericError";
import { formatGenericError } from "@/lib/service/formatGenericError";
import { requireWorkspace } from "@/lib/service/requireWorkspace";
import { validateInput } from "@/lib/service/validateInput";

export async function createOfferAction(
  input: CreateOfferRequest,
): Promise<CreateOfferPayload> {
  const validation = validateInput(CreateOfferRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const workspace = await requireWorkspace<CreateOfferResponse>();
    if (!workspace.success) return workspace.payload;

    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb
      .from("offers")
      .insert({
        workspace_id: workspace.workspaceId,
        name: validation.data.name,
        description: validation.data.description ?? null,
        // ... other fields ...
      })
      .select("*")
      .single();

    if (sbError) {
      return { error: formatSupabaseError(sbError, "Failed to create offer.") };
    }
    return { data: mapOfferRow(data) };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Failed to create offer.",
    });
  }
  return { error };
}
```

- **`workspace.workspaceId` is passed to `.insert()`** — RLS's
  `with check` requires the column to equal `app.current_workspace_id()`
  or the row is rejected. This is intentionally belt-and-braces.
- **Soft delete = `UPDATE` with `deleted_at`**, not `DELETE`. Every
  entity in this project follows the same pattern — see
  `actions/offers/deleteOfferAction.ts`.

#### Query keys module (`hooks/<domain>/<domain>QueryKeys.ts`)

```typescript
// hooks/offers/offersQueryKeys.ts

const OFFERS = "offers" as const;

export const offersRoot = (clerkOrgId: string | null) =>
  [OFFERS, clerkOrgId] as const;

export const offersListKey = (
  clerkOrgId: string | null,
  page: number,
  pageSize: number,
) => [OFFERS, clerkOrgId, "list", page, pageSize] as const;

export const offerDetailKey = (clerkOrgId: string | null, offerId: string) =>
  [OFFERS, clerkOrgId, "detail", offerId] as const;
```

- **`clerkOrgId` is the CLERK org identifier** (from `useAuth().orgId`),
  never the Supabase workspace uuid — see CLAUDE.md "Identity
  boundaries".
- All entries sit under `[OFFERS, clerkOrgId]`, so a single
  `invalidateQueries({ queryKey: [OFFERS, clerkOrgId] })` on write flushes
  every list, search, and detail entry for the org — matches the ticket
  format `org:{org}:offers`.
- Keys are flat arrays of primitives — that keeps structural prefix
  matching working at any depth (e.g. `[OFFERS, orgId, "list"]` matches
  every list page; `[OFFERS, orgId, "list", 1]` matches only page 1).

#### Hooks

The query hook passes a single `getQueryKey(params) => readonly unknown[]`
callback to `useGenericServerQueryAction`. Wire it to the builder so the
builder is the only place the key shape is defined — no chance for the
hook and the invalidation builder to drift.

```typescript
// hooks/offers/useListOffers.ts
import { useAuth } from "@clerk/nextjs";
import { listOffersAction } from "@/actions/offers/listOffersAction";
import { ListOffersPayload } from "@/types/offers/listOffersPayload";
import { ListOffersRequest } from "@/types/offers/listOffersRequest";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { offersListKey } from "./offersQueryKeys";

export const useListOffers = () => {
  const { orgId } = useAuth();

  const { query, action } = useGenericServerQueryAction<
    ListOffersRequest,
    ListOffersPayload
  >(
    (params) => offersListKey(orgId ?? null, params.page, params.pageSize),
    listOffersAction,
  );

  return [query, action] as const;
};
```

```typescript
// hooks/offers/useCreateOffer.ts
import { useAuth } from "@clerk/nextjs";
import { createOfferAction } from "@/actions/offers/createOfferAction";
import { CreateOfferPayload } from "@/types/offers/createOfferPayload";
import { CreateOfferRequest } from "@/types/offers/createOfferRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";

export const useCreateOffer = () => {
  const { orgId } = useAuth();

  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    CreateOfferRequest,
    CreateOfferPayload
  >(["offers", "create"], [["offers", orgId ?? null]], createOfferAction);

  return [mutate, mutateAsync, isPending] as const;
};
```

- **`orgId ?? null`** in the key slot — see CLAUDE.md "Identity
  boundaries". `null` briefly during Clerk hydration or durably if the
  user has no active org; the server rejects either way via
  `requireWorkspace`.
- **`useGenericServerMutateAction`'s second arg is an array of
  prefixes**, not a single prefix. `[["offers", orgId ?? null]]` is one
  prefix wrapped in the outer array; add more prefixes to invalidate
  multiple key families. Pass a function `(data) => [...]` for
  response-aware invalidation (e.g. `['leads', org, 'detail', leadId]`
  only when the mutation touches a lead). See
  `hooks/actions/useEditAction.ts` for the dynamic form.

#### Multi-key invalidation (dynamic)

When a mutation touches related entities, invalidate multiple key
families. The mutation hook accepts either a static `readonly QueryKey[]`
or a function of the response:

```typescript
// hooks/actions/useEditAction.ts
export const useEditAction = () => {
  const { orgId } = useAuth();
  const org = orgId ?? null;

  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    EditActionRequest,
    EditActionPayload
  >(
    ["actions", "edit"],
    (data) => {
      const keys: (readonly (string | null)[])[] = [["actions", org]];
      const leadId = data.data?.lead_id;
      if (leadId) keys.push(["leads", org, "detail", leadId]);
      return keys;
    },
    editActionAction,
  );

  return [mutate, mutateAsync, isPending] as const;
};
```

- Always invalidates `['actions', org]` (covers list/search/detail).
- Conditionally invalidates `['leads', org, 'detail', leadId]` when
  the response carries a `lead_id`. Matches the ticket format
  `+ lead:{org}:{leadId} if linked`.

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
> module ends up in the client bundle, matching the `lib/supabase/*.ts`
> precedent. `"use server"` is NOT a substitute — that marks a file's exports
> as callable-from-client via RPC, which is wrong for a factory returning a
> non-serializable `HttpClient`. Skip only on unauthorized / public-endpoint
> clients that read `NEXT_PUBLIC_*` alone.
>
> **Read the private env var inside the factory, not at module load.** Missing
> runtime secrets otherwise crash Next's build-time page data collection.
> `NEXT_PUBLIC_*` vars are fine to validate at module scope (they exist at
> build time by definition).

```typescript
import "server-only";

import { HttpClientFactory } from "@/services/shared/httpClientFactory";
import { createAuthInterceptor } from "@/services/shared/createAuthInterceptor";

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

// Pattern 3: Bearer Token (dynamic, runs before each request)
export function createBearerClient() {
  return HttpClientFactory.createClient({
    baseURL: "https://api.example.com",
    requestMiddleware: [
      createAuthInterceptor(async () => {
        const { auth } = await import("@clerk/nextjs/server");
        return (await auth()).getToken();
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
