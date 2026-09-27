import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { getCurrentWorkspaceId } from "@/lib/supabase/getCurrentWorkspaceId";
import { verifySubscriptionCallback } from "@/services/paystack/verifySubscriptionCallback";

import { CallbackSuccessClient } from "./callback-success-client";

/**
 * Paystack subscription callback landing page.
 *
 * ## Where this fits
 *
 * `subscribeAction` calls `/transaction/initialize` with a `callback_url`
 * pointing here. After the user completes checkout on Paystack's hosted
 * page, they're redirected back with `?trxref=X&reference=X` (both carry
 * the same value — read `reference`; `trxref` is a legacy duplicate).
 *
 * ## The workflow, extracted
 *
 * The multi-step verify → parse-metadata → tamper-check → plan-resolve
 * state machine lives in
 * `services/paystack/verifySubscriptionCallback.ts`. This route is now a
 * thin script: check preconditions, delegate, apply the pla claim,
 * hand off to the client success component. Redirect calls stay at the
 * route boundary so the helper stays unit-testable.
 *
 * ## Responsibilities
 *
 *   1. Cheap preconditions — reference present, workspace resolvable
 *      from the Clerk session.
 *   2. Delegate verification to `verifySubscriptionCallback` and
 *      translate its discriminated result into a redirect on failure.
 *   3. Set the Clerk `pla` claim inline (fast-path claim the layout
 *      gate reads). Belt-and-braces — the `subscription.create`
 *      webhook also sets it, but we don't want the user's next
 *      navigation to bounce off the gate while we wait for Paystack.
 *   4. Hand off to a client component that reloads the Clerk session
 *      (so the JWT carries the fresh `pla`) and redirects to
 *      `/dashboard` after a short beat.
 *
 * ## What this does NOT do
 *
 * Insert / upsert a `subscriptions` row. The
 * `subscriptions_provider_ids_required` check constraint forbids an
 * `active` row without `subscription_code` / `customer_code` /
 * `email_token`, and `/transaction/verify` doesn't return those fields —
 * they arrive with the `subscription.create` webhook, which remains the
 * sole state writer for the sub row (load-bearing decision).
 *
 * ## Auth model
 *
 * This route lives under the `(gate)` route group — signed-in-but-ungated
 * pages that need to be reachable BEFORE the caller has a `pla` claim.
 * `middleware.ts` still requires sign-in on every route not listed in
 * `isPublicRoute`, and the callback is NOT in that list, so Clerk
 * enforces authentication. The `(app)/` layout gate doesn't run for this
 * route because it lives outside that group — exactly what lets a
 * pla-less user reach the page to unlock their claim.
 */

// #region TYPES

type SearchParams = Promise<{
  reference?: string;
  trxref?: string;
}>;

// #endregion

// #region VIEW

export default async function SubscriptionCallbackPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { reference } = await searchParams;
  if (!reference) redirect("/subscribe?error=missing_reference");

  const currentWorkspaceId = await getCurrentWorkspaceId();
  if (!currentWorkspaceId) redirect("/subscribe?error=no_workspace");

  const result = await verifySubscriptionCallback({
    reference,
    currentWorkspaceId,
  });
  if (!result.ok) {
    redirect(`/subscribe?error=${encodeURIComponent(result.errorCode)}`);
  }

  // Set the Clerk `pla` claim so the next authenticated request sees
  // `status: 'active'`. `orgId` comes from the caller's session token —
  // same source that RLS reads to scope the workspace lookup, so
  // matching metadata.workspace_id above implies this orgId is the
  // right owner for the transaction.
  const { orgId } = await auth();
  if (orgId) {
    const clerk = await clerkClient();
    await clerk.organizations.updateOrganizationMetadata(orgId, {
      publicMetadata: {
        pla: { code: result.planCode, status: "active" },
      },
    });
  }

  return <CallbackSuccessClient />;
}

// #endregion
