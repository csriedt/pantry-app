import { Sparkles } from "lucide-react";
import Link from "next/link";

import { GateHeaderUserChip } from "@/components/app/gate-header-user-chip";

import { GateErrorBanner } from "./gate-error-banner";

/**
 * Shell for signed-in-but-ungated routes.
 *
 * ## What lives in here
 *
 * Pages that a user needs to reach BEFORE they have an active `pla`
 * claim: `/subscribe` (checkout) and `/subscription/callback`. The
 * `(gate)` group name signals "before the gate" — deliberately
 * outside `app/(app)/`, whose layout enforces the pla check.
 *
 * ## What this layout does NOT do
 *
 *   - No auth check. `middleware.ts` enforces sign-in on every route
 *     not listed in `isPublicRoute`; these pages inherit that.
 *   - No pla check. That's what makes these routes "ungated" — by
 *     definition, they're the places the user can be without pla.
 *   - No width constraint on `<main>`. Pages inside must center their
 *     own content — /subscribe renders a master–detail grid at
 *     `max-w-5xl`, while the callback page centers a small status
 *     card. If this layout wrapped children in a centering flex
 *     container, wider layouts wouldn't be reachable without ugly
 *     `-mx-*` breakouts.
 *
 * ## Header shape: matches the public nav
 *
 * The header intentionally mirrors the public `/pricing` and landing
 * top-nav: sticky bar, `border-b` + `backdrop-blur-sm`, compact
 * `size-8` logo, `max-w-6xl` container with `py-4` padding. Users
 * moving between `/` → `/subscribe` → callback → app get consistent
 * chrome across the whole entry funnel — no visual "you've stepped
 * into a different site" jolt at the /subscribe boundary.
 *
 * ## User chip in the header
 *
 * Rendered via `<GateHeaderUserChip />` — a tiny client wrapper.
 * (Historically also hid the chip on the pre-move public /pricing
 * route which lived under this group; today it's just the auth chip
 * for the two signed-in-adjacent routes.)
 *
 * ## Why a route group, not a plain directory
 *
 * `(gate)` compiles out of the URL — /subscribe stays at /subscribe.
 * The group only exists to give these pages a shared layout and to
 * signal intent in the file tree that they are a distinct class of
 * routes from the gated app under (app)/.
 */
export default function GateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="border-border/60 bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          {/* Logo → landing. Consistent with the public nav pattern
              and gives users a subtle "back to home" affordance if
              they land here and change their mind. */}
          <Link href="/" className="flex items-center gap-2.5">
            <span className="bg-primary flex size-8 shrink-0 items-center justify-center rounded-lg text-white">
              <Sparkles className="size-4" />
            </span>
            <span className="font-display text-foreground text-lg font-bold tracking-[-0.02em]">
              previous-app
            </span>
          </Link>
          <GateHeaderUserChip />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-md justify-center px-6 pt-6">
        <GateErrorBanner />
      </div>
      <main className="flex flex-1 flex-col pt-4">{children}</main>
    </div>
  );
}
