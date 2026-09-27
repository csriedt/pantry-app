import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

import { listPlansAction } from "@/actions/billing/listPlansAction";
import { Subscribe } from "@/components/screens/subscribe";
import { SITE_NAME } from "@/lib/site";
import { redirect } from "next/navigation";

// #region TYPES

// Mirrors the shape defined by the Clerk JWT template
// (`{ "pla": "{{org.public_metadata.pla}}" }`) — same one the (app)/
// layout gate reads. Kept as a local type here because copying the
// three-line shape is less coupling than importing a private type from
// another layout module.
type PlaClaim = {
  code?: string;
  status?: "active" | "past_due" | "cancelled" | "non-renewing";
};

// Next 16 hands `searchParams` to page components as a Promise —
// awaiting it is how we opt this page into dynamic rendering. The
// `plan` field is a plan-code hint carried in from the pricing → sign-up
// → subscribe funnel (approach A of the "carry plan intent through
// signup" design); see `PlanIntent` in the docstring below for the
// full flow.
type SearchParams = Promise<{
  plan?: string;
}>;

// #endregion

// #region METADATA

const TITLE = `Subscribe · ${SITE_NAME}`;
const DESCRIPTION =
  "Pick a plan to unlock your PreviousApp workspace. Cancel any time.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/subscribe" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/subscribe" },
  twitter: { title: TITLE, description: DESCRIPTION },
  // Signed-in-only surface — don't waste crawl budget indexing it, and
  // don't leak the exact plan structure to crawlers.
  robots: { index: false, follow: false },
};

// #endregion

// #region VIEW

/**
 * Signed-in `/subscribe` surface — the "in-flow checkout" page.
 *
 * ## Convention deviation — heads up for agents & contributors
 *
 * This page reads `listPlansAction` directly via `await` in a server
 * component rather than going through the standard RQ hook wrapper
 * (`useGenericServerQueryAction`) that `services/shared/AGENTS.md`
 * prescribes. That deviation is deliberate and specific to this
 * acquire-shaped page — see
 * [`actions/billing/README.md`](../../../actions/billing/README.md)
 * for the full rationale. **Do NOT treat this as precedent for other
 * domains** — offers/actions/leads/campaigns etc. all use the RQ hook
 * pattern and new domains should too.
 *
 * ## Not a marketing page
 *
 * A future public `/pricing` route (marketing-shaped, sections and
 * feature comparison, coral hero, etc.) is staged at
 * `app/(gate)/_pricing/` for later promotion. This `/subscribe` page
 * is the in-flow checkout: user landed here from the layout gate,
 * has already been "sold", just needs to pick a plan and pay. Kept
 * compact and admin-flavoured on purpose.
 *
 * ## Gating (load-bearing: must not loop with the layout gate)
 *
 * Both this page and `app/(app)/layout.tsx` need to answer "is the
 * caller covered?" and MUST use the same signal — the Clerk `pla`
 * claim. If one side reads the claim and the other reads the DB
 * subscription row, they can disagree (webhook lag, manual claim
 * edit, DB drift) and produce a redirect loop.
 *
 *   - `pla.status === 'active'` OR `'non-renewing'` → covered →
 *     302 to `/business-profile#subscription`.
 *   - anything else (missing, `past_due`, `cancelled`) → they belong
 *     on this page. `past_due` users specifically get here from the
 *     layout gate on next request; a fresh checkout via
 *     `subscribeAction` is how they restart billing.
 *
 * ## Plan-intent handoff via `?plan=<code>`
 *
 * When a visitor clicks Subscribe on the public `/pricing` page, the
 * intended plan travels through the sign-up funnel via the URL. Clerk
 * preserves the caller's `redirect_url` search param across its
 * multi-step sign-up UI and drops the user back at
 * `/subscribe?plan=<code>` on completion. We read the hint here and
 * forward it as `initialPlanCode` to the `Subscribe` screen, which
 * pre-selects that plan in its master–detail UI (falling back to the
 * "Most popular" heuristic if the code doesn't match a known plan).
 *
 * The hint is a *nudge*, not load-bearing correctness — sanity checks
 * happen at the payment boundary. Tampering with the URL just changes
 * which card is pre-highlighted; the user still confirms with a click
 * and a billing-email prompt before checkout runs.
 */
export default async function SubscribePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { sessionClaims } = await auth();
  const pla = (sessionClaims as { pla?: PlaClaim } | null | undefined)?.pla;

  const isCovered = pla?.status === "active" || pla?.status === "non-renewing";
  if (isCovered) {
    redirect("/business-profile#subscription");
  }

  const { plan: planHint } = await searchParams;
  const plansPayload = await listPlansAction();

  // Deny-by-default on the surface: never leak raw error messages to
  // the user (they can include env-var names, Postgres codes, etc.).
  // Log the underlying detail server-side, then hand the Subscribe
  // screen an empty list — it already renders a friendly "Plans coming
  // soon" empty state, which is the right thing to show whether the
  // catalog is genuinely empty or a read failed.
  if (plansPayload.error) {
    const message =
      typeof plansPayload.error === "string"
        ? plansPayload.error
        : plansPayload.error.message;
    console.error("[subscribe] Failed to list plans:", message);
    return <Subscribe plans={[]} initialPlanCode={planHint} />;
  }

  return (
    <Subscribe
      plans={plansPayload.data?.items ?? []}
      initialPlanCode={planHint}
    />
  );
}

// #endregion
