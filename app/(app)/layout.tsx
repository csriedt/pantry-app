import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import type * as React from "react";

import { AppShell } from "@/components/app/app-shell";
import { reconcileExpiredNonRenewingSubs } from "@/lib/billing/reconcilePeriodEnd";

// #region TYPES

// The `pla` claim mirrors `organizations.public_metadata.pla` via the Clerk
// JWT template configured in the Clerk dashboard
// (`{ "pla": "{{org.public_metadata.pla}}" }`). Either absent (no
// subscription on the org yet) or the object shape below.
type PlaClaim = {
  code?: string;
  status?: "active" | "past_due" | "cancelled" | "non-renewing";
};

// #endregion

// #region DATA

// Request-scoped `now`. React 19's purity rule flags direct `Date.now()`
// calls in a server component's render body ("Cannot call impure function
// during render"). Wrapping in `cache()` makes the read stable within a
// single request — the compiler accepts it because the call site returns
// the same value throughout a render — while still varying across requests,
// which is what a request-time gate needs.
const getRequestNow = cache((): number => Date.now());

// #endregion

// #region VIEW

/**
 * Gated app shell.
 *
 * The layout has one job here: **is this caller covered?** Fast-path
 * check against the Clerk `pla` claim, then a lazy period-end sweep
 * that catches non-renewing subs whose paid period just expired.
 *
 * Both steps are simple `redirect` + delegate — the actual state
 * machine lives in
 * `lib/billing/reconcilePeriodEnd.ts::reconcileExpiredNonRenewingSubs`.
 * Keeping this file thin means the "who can enter the app" policy
 * reads top-to-bottom without hunting for the reconciliation logic.
 *
 * ## `pla` claim vs DB sub state
 *
 * The gate reads Clerk (`sessionClaims.pla`) not the DB — it's a
 * per-request signal, no round-trip. The reconciliation helper is
 * where the DB gets consulted, and it also owns clearing the pla
 * claim when appropriate. Both sources are kept in sync by that
 * helper; the gate itself just trusts pla.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sessionClaims, orgId } = await auth();
  const pla = (sessionClaims as { pla?: PlaClaim } | null | undefined)?.pla;

  // `non-renewing` passes the gate — the user has paid time remaining
  // and belongs in the app. The reconciliation step below is what
  // eventually flips them to `cancelled` and bounces on their next
  // request past `current_period_end`.
  const isCovered =
    !!pla && (pla.status === "active" || pla.status === "non-renewing");
  if (!isCovered) redirect("/subscribe");

  const { stillCovered } = await reconcileExpiredNonRenewingSubs({
    orgId: orgId ?? null,
    now: getRequestNow(),
  });
  if (!stillCovered) redirect("/subscribe");

  return <AppShell>{children}</AppShell>;
}

// #endregion
