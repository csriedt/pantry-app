# Component patterns

Custom React components in this app follow one shape. The canonical,
well-formed reference is [`example/example-component.tsx`](example/example-component.tsx)
— a live example to read while creating a component. Match its shape: the same
region names, the same order, the same marker syntax.

shadcn components (`ui/`) are the other half: generated from the registry and
restyled to the design tokens. Don't hand-roll what shadcn offers — add it,
then restyle its generated file.

Route screens live outside this directory, in
[`screens/`](../screens/AGENTS.md): a screen is the client component a route
renders, and it composes the composites below.

## What lives here

- `ui/` — shadcn components, added with `npx shadcn@latest add <name>` and
  restyled to the theme. After generation they are ours to edit.
- `composites/` — custom components (non-shadcn, non-AI) in the house shape.
- `example/` — the pattern reference for `composites/`; not shipped UI.
- `providers/` — app-wide context providers, mounted once in the root layout.
- `ai/` — AI-facing components (reserved).

## The shape

Regions are delimited by the exact markers `// #region NAME` and
`// #endregion`. Order is fixed — it keeps values defined before they are
used — but repetition is allowed: if a later region needs a value that would
otherwise be defined too late (common with CONSTANTS), add another
`#region CONSTANTS` block at that point instead of reordering.

1. **TYPES** — the `<Component>Properties` interface. Move it to a sibling
   `properties.ts` when it grows or is shared.
2. **CONSTANTS** — destructure props here; this is also where defaults live
   (`b = 0`), not at the use sites. Plain derived values live here too: if it
   can be computed from props/state, compute it during render — don't mirror
   it into `useState` and keep it in sync with an effect. An expensive
   derivation moves to HOOKS as `useMemo`.
3. **HOOKS** — state, memos, custom hooks. Props flow in freely here
   (initializers, deps, hook arguments), and memoized derivations land here.
   Keep state minimal: only values that change over time through interaction;
   never a copy of props or of derivable data.
4. **HELPERS** — local functions used by handlers or the view.
5. **HANDLERS** — event entry points (`onClick`, `onChange`, …). Logic caused
   by a user action belongs here, not in an effect.
6. **LIFECYCLE** — effects, and only for two reasons: synchronizing with an
   external system (network, DOM, browser APIs, non-React widgets) or code
   that must run because the component was displayed. Reacting to props/state
   here is right when it is that synchronization — it is wrong when the
   effect's job is to `setState` a value derived from props/state (that
   belongs in CONSTANTS), and resetting state on a prop change belongs in a
   `key`.
7. **VIEW** — the JSX return. No side effects.

## Theme

All values live in `app/globals.css` (the `tokens.css` port): `bg-canvas`,
`text-ink`, `border-strong`, `bg-rust`, `rounded-control`, `text-card`,
`tracking-micro`, … Never hard-code a hex or a one-off radius in a component.

## Rules

- **Prefer shadcn.** If the registry has it, add and restyle it — don't
  recreate it in `composites/`.
- **Server data never comes from an effect.** Use the service-flow hooks
  (`services/shared/README.md`), server components, or server actions.
- **Subscribe to external stores with `useSyncExternalStore`** (see
  `ui/toaster.tsx`), never an effect that mirrors the store into state.
- **The lint backstop is on.** `react-hooks/set-state-in-effect` is an error
  via `eslint-config-next` and catches synchronous `setState` in effects; it
  cannot see indirect cases, so the conventions above cover those.
- **Placeholder comments are example-only.** Implementations keep the region
  markers and drop the `// ...` scaffolding; drop whole regions the component
  doesn't need.

## Stamping a new component

1. Custom component: create the file at
   `components/composites/<area>/<component-name>.tsx`; keep
   `example/example-component.tsx` open as the reference.
2. Mirror its region skeleton — names, order, and the exact
   `#region NAME` / `#endregion` markers.
3. Rename the component, the properties interface, and the placeholders.
4. Fill the regions; keep only what the component needs; duplicate a region
   if ordering would otherwise use a value before it is defined.
5. Run `npm run lint` — placeholder warnings should not survive the fill-in.
6. shadcn-backed piece: `npx shadcn@latest add <name>`, then restyle in `ui/`.
