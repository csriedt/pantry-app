# Pantry app

A Next.js app whose service layer lives in
[`services/shared/`](services/shared/README.md): a typed, deny-by-default
service-flow stack (HTTP transport, error contract, React Query hooks,
server caching) that keeps data-fetching policy out of components.

- **Patterns and templates:** [`services/shared/README.md`](services/shared/README.md)
- **Rules for adding domains:** [`services/shared/AGENTS.md`](services/shared/AGENTS.md)
- **Working demo:** the pet store sandbox at `/sandbox`
  (`actions/petStore/`, `hooks/petStore/`, `app/api/webhooks/petStore/`,
  `tests/petStoreContract.test.tsx`)
- **Design decisions and remaining work:** [`docs/service-layer-plan.md`](docs/service-layer-plan.md)

## Scripts

```bash
npm run dev      # next dev
npm run build    # next build
npm test         # vitest run
```
