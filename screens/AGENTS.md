# Screens

A screen is the client component a route renders. It is a component first: the
stamp, region order, theme, and shadcn rules in
[`components/AGENTS.md`](../components/AGENTS.md) apply unchanged. This file
only adds the route-level rules.

Live reference: `screens/settings-screen.tsx` with
`app/(app)/settings/page.tsx` — no props, one read, one extracted dialog.

## Shape

- `app/(app)/<route>/page.tsx` — server entry. Renders exactly one screen and
  may export `metadata`. With no view input it stays sync (settings). With a
  real view input it may await `searchParams` and pass a plain value down. It
  does not fetch or cache screen data. No Suspense of its own:
  `app/(app)/layout.tsx` owns the boundary and catches the page's `await`.
- `screens/<route>-screen.tsx` — `"use client"`. Owns the route's hooks,
  handlers, lifecycle, and view. Use the component stamp's regions in order
  (`TYPES → CONSTANTS → HOOKS → HELPERS → HANDLERS → LIFECYCLE → VIEW`) and
  drop what the screen doesn't need. No props means no TYPES; a derived value
  that depends on a hook goes in a second CONSTANTS block after HOOKS.
- The stamp's module-scope rule applies: static constants and pure helpers
  get their own `#region CONSTANTS` / `#region HELPERS` blocks above the
  screen; anything derived from hooks stays inside. Render-only JSX can stay
  a local `HELPERS` function.
- View input is either a plain prop from the page or a client hook
  (`useSearchParams()`, `useParams()`). The page awaits only when it needs the
  value itself (e.g. `metadata`); otherwise the screen reads it. Never pass a
  `searchParams` or `params` promise into a client component and never unwrap
  it in a child. A prop-driven screen can render directly in tests.

## Data

- Inside `(app)`, `useSessionUserId()` scopes query keys; `null` means no
  session, so don't dispatch. Server components use `getSessionUser()`.
- Dispatch the initial read from LIFECYCLE once the id resolves:
  `dispatchSummary({ params: {} })`. Dispatch writes from HANDLERS:
  `mutate(input, { onSuccess, onError })`.
- Hooks keep the action's `{ data }` envelope: read `query.data?.data`.
  Loading and error come from the query (`isPending`, `isError`), not from the
  URL.
- Never patch query data after a mutation. The hooks invalidate the domain
  key; the refetch is the update.

## Boundaries

- A row, dialog, or skeleton that outgrows the screen moves to
  `components/composites/<area>/` and follows the component stamp. The
  delete-account dialog is the current example.
- The URL selects a view; it never asserts server truth. "Deletion pending",
  "pantry empty", "read failed" come from the query result, not `?state=`.
  A fixture may force a *view*, never a *fact*.

## Not this

- No `*-screen.tsx` beside `page.tsx`.
- No `FromParams`-style child that only unwraps a route promise, and no
  page-level `<Suspense>`.
- No second component defined in a screen file.
- No URL fixture that fabricates a data state (`?state=error`,
  `?state=first-run`). That belongs in the design preview or a test.
- No `"use server"`, Supabase client, or cache calls in a screen.
