<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repo

A Next.js 16 app whose real subject is the service layer: one typed path for data, with
caching, paging, errors and auth handled once. Read the area file before changing that area.

## Where the rules live

- `services/shared/AGENTS.md` - the service-flow rules, and the two layouts for a new domain.
- `lib/db/AGENTS.md` - schema conventions, migrations, the RPC contract.
- `components/AGENTS.md` - the component stamp, regions, theming.
- `screens/AGENTS.md` - what a screen owns, and where reads and writes are dispatched.
- `docs/adr/0001-trusted-reads-and-server-cache.md` - why trusted reads exist at all.

## Commands

Node 22.

```bash
npm run dev
npm run build
npm test               # no database needed
npm run test:rls       # needs DATABASE_URL
npm run lint
npm run db:migrate
npm run db:gen-types   # needs the Supabase CLI, writes lib/db/database.types.ts
```

## Invariants

These are not preferences. Breaking one is a design change, not a refactor.

- **RLS is the boundary.** Application code decides nothing about who may read a row. Auth
  is a precondition for the query, not a substitute for the policy.
- **The bypass client has two uses.** Global reference tables with no user rows, and the
  unexported cached function that calls a `_for` RPC. A third use is the drift to watch for.
- **The id comes from the session.** A `_for` RPC takes `p_user_id` from the session the
  server resolved, never from a client payload. That id is also the cache key.
- **One statement per write.** A check and its write live in the same function, so two
  concurrent callers cannot both pass a check that was true a moment ago.
- **A screen owns no data access.** No Supabase client, no server action, no cache call
  inside `screens/`.
- **The refetch is the update.** Never patch query data after a mutation. Invalidate the
  domain key and let the query run.

## Conventions

- Two-space indent. TypeScript strict. `@/` for imports.
- Server actions return the `{ data }` envelope. Hooks read `query.data?.data`.
- One migration per concern, numbered in `drizzle/`. Function bodies are hand-written SQL.
- `lib/db/database.types.ts` is generated from the live database. Regenerate it, never edit
  it by hand.
- Tests are vitest. Add a case to the RLS suite whenever a policy or an RPC changes.

## Not this

- No client-side Supabase calls.
- No hand-written type standing in for a generated one.
- No view state invented from the URL. The URL may select a view, never assert a fact.
