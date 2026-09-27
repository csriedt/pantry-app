import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import type { Database, Json } from "@/lib/db/database.types";
import { createBypassSupabaseClient } from "@/lib/supabase/bypassSupabaseClient";
import { createPaystackClient } from "@/services/paystack/paystackClient";
import { verifyPaystackSignature } from "@/services/paystack/verifyPaystackSignature";
import type { PaystackEnvelope } from "@/types/billing/paystackEnvelope";

/**
 * Paystack webhook handler.
 *
 * Responsibilities, in order:
 *   1. Read raw body (signature is computed on raw bytes — parsing first
 *      changes whitespace / key order and would invalidate the HMAC).
 *   2. Verify HMAC-SHA512(rawBody, PAYSTACK_SECRET_KEY) against the
 *      x-paystack-signature header. Reject 401 on mismatch.
 *   3. Parse JSON; on parse failure return 400 (unrecoverable).
 *   4. Idempotency check via billing_events keyed on (provider_event, reference).
 *      Return 200 immediately if we've already processed this event —
 *      Paystack retries on non-2xx, and we do NOT want duplicate side effects.
 *   5. Log the event to billing_events with processed_at = null.
 *   6. Dispatch on event.event to the appropriate handler.
 *   7. Mark billing_events.processed_at = now() on success.
 *   8. Return 200.
 *
 * ## HTTP status semantics for Paystack retries
 *
 *   200 — accepted. Paystack stops retrying. Use for: success, duplicate,
 *         unknown event (we don't care), permanent validation failure
 *         (retrying won't help).
 *   4xx — bad request. Signature failure (401) or malformed JSON (400).
 *         Paystack may retry with backoff.
 *   5xx — transient server error. Handler exception, DB unreachable.
 *         Paystack retries with backoff — which is what we want for
 *         retriable failures.
 *
 * ## Auth model
 *
 * There is no Clerk session in webhook context — Paystack's server is the
 * caller. All DB reads/writes go through `createBypassSupabaseClient()`.
 * RLS does not apply.
 */

// #region TYPES

type WebhookEnvelope = {
  event: string;
  data: Record<string, unknown>;
};

type PlaClaim = {
  code: string;
  status: "active" | "past_due" | "cancelled";
};

// #endregion

// #region UTIL

/**
 * Extract the idempotency reference for a given event type. Different events
 * carry different natural unique identifiers — we normalize to one column so
 * (provider_event, reference) is the composite dedup key across the table.
 */
function referenceFor(event: string, data: Record<string, unknown>): string | null {
  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;

  switch (event) {
    case "charge.success":
      return asString(data.reference);
    case "subscription.create":
    case "subscription.not_renew":
    case "subscription.disable":
      return asString(data.subscription_code);
    case "invoice.create":
    case "invoice.update":
      // Both events carry `invoice_code` on `data` and share a shape with
      // `invoice.payment_failed`. `provider_event` in the composite dedup key
      // keeps create vs update vs failed distinct for the same invoice.
      return asString(data.invoice_code);
    case "invoice.payment_failed": {
      const invoiceCode = asString(data.invoice_code);
      if (invoiceCode) return invoiceCode;
      const tx = data.transaction as Record<string, unknown> | undefined;
      return asString(tx?.reference);
    }
    default:
      return null;
  }
}

/**
 * Update a Clerk organization's `publicMetadata.pla` — the fast-path claim
 * the layout gate reads to decide access. `null` clears the claim so the gate
 * kicks the user to /subscribe on their next request.
 *
 * Uses Clerk backend SDK — no user session required.
 */
async function setPlaClaim(
  clerkOrgId: string,
  pla: PlaClaim | null
): Promise<void> {
  const client = await clerkClient();
  await client.organizations.updateOrganizationMetadata(clerkOrgId, {
    publicMetadata: { pla },
  });
}

/**
 * Resolve `workspaces.clerk_org_id` for a workspace uuid. Returns null if
 * the workspace is missing (deleted, or replay of a fixture with a
 * placeholder uuid) — the caller warns and skips the Clerk update rather
 * than failing the whole event. On a transient DB error we throw so the
 * outer handler returns 500 and Paystack retries; swallowing it here would
 * mark the event processed while leaving the Clerk pla claim out of sync
 * with the DB.
 */
async function clerkOrgIdFor(
  sb: ReturnType<typeof createBypassSupabaseClient>,
  workspaceId: string
): Promise<string | null> {
  const { data, error } = await sb
    .from("workspaces")
    .select("clerk_org_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) {
    console.error("[paystack webhook] clerk org lookup failed:", error);
    throw error;
  }
  if (!data) return null;
  return data.clerk_org_id;
}

// #endregion

// #region HANDLERS

/**
 * `charge.success` — fires on every successful charge (first subscription
 * payment AND every renewal). Pure audit no-op beyond the billing_events log.
 *
 * ## Division of labour
 *
 * - `subscription.create` is the primary state writer on first payment.
 *   Resolves `workspace_id` via a `billing_email → workspaces` lookup
 *   (Paystack Customer email is immutable, so the correlation is stable),
 *   so this handler is ordering-independent of `charge.success`.
 * - `invoice.update` owns period-edge advancement on every renewal (writes
 *   both `current_period_start` and `current_period_end`) when the local
 *   sub is still `active`. No recovery walk-back — local status is strictly
 *   one-way in v1.
 *
 * That leaves charge.success with nothing to do beyond the audit trail
 * `billing_events` already captures.
 */
async function handleChargeSuccess(): Promise<void> {
  // No-op — the billing_events row already logs the raw payload.
}

/**
 * `subscription.not_renew` — fires when `POST /subscription/disable` is
 * called (empirically: this is the ONLY webhook that fires for user cancels,
 * despite the API endpoint being named "disable"). Paystack sets the
 * subscription's status to `'non-renewing'`; it will NOT auto-renew at
 * `next_payment_date`, but is still active for the current period.
 *
 * ## What we do
 *
 * Flip local `subscriptions.status` to `'non-renewing'`. **Deliberately do
 * NOT clear the Clerk `pla` claim** — user retains access until the
 * current period ends, honoring the "you paid for the month, you get the
 * month" v1 UX.
 *
 * ## What closes the loop at period end
 *
 * The layout gate (phase 9) does a lazy check: on the next authenticated
 * request past `current_period_end`, if the local subscription is
 * `non-renewing`, the gate self-cleans (flips to `'cancelled'`, clears the
 * pla claim, redirects to /subscribe). No cron / scheduled job required for
 * v1 — the check piggybacks on the next natural request.
 */
async function handleSubscriptionNotRenew(
  sb: ReturnType<typeof createBypassSupabaseClient>,
  data: Record<string, unknown>
): Promise<void> {
  const subscriptionCode =
    typeof data.subscription_code === "string" ? data.subscription_code : null;
  if (!subscriptionCode) {
    console.warn(
      "[paystack webhook] subscription.not_renew missing subscription_code"
    );
    return;
  }

  const { data: updated, error } = await sb
    .from("subscriptions")
    .update({
      status: "non-renewing",
      updated_at: new Date().toISOString(),
    })
    .eq("subscription_code", subscriptionCode)
    .select("workspace_id")
    .maybeSingle();

  if (error) {
    console.error(
      "[paystack webhook] subscription.not_renew update failed:",
      error
    );
    throw error;
  }
  if (!updated) {
    console.warn(
      `[paystack webhook] subscription.not_renew: no local row for ${subscriptionCode}`
    );
    return;
  }

  // pla claim intentionally left as-is. Layout gate handles period-end
  // expiry lazily on the next authenticated request.
}

/**
 * `subscription.create` — fires when a subscription is first created (after
 * the initial charge succeeds). Primary state writer: upserts the
 * subscription row and flips the Clerk pla claim to grant access.
 *
 * ## Correlation via billing_email (order-agnostic)
 *
 * Paystack does NOT echo the initiating transaction's `metadata` on this
 * event (verified against real payloads on 2026-07-14), so we can't use
 * `metadata.workspace_id`. Instead we correlate via `customer.email`, which
 * IS present on every webhook and is set by `subscribeAction` to match
 * `workspaces.billing_email`. Since Paystack's Customer email is immutable
 * (their `PUT /customer/:code` doesn't accept an email field), this
 * correlation can never drift.
 *
 * Because the correlation is independent of `charge.success`, this handler
 * can succeed even if `charge.success` hasn't been logged yet — no retry
 * cycle, no ordering assumption.
 */
async function handleSubscriptionCreate(
  sb: ReturnType<typeof createBypassSupabaseClient>,
  data: Record<string, unknown>
): Promise<void> {
  const plan = data.plan as Record<string, unknown> | undefined;
  const planCode = typeof plan?.plan_code === "string" ? plan.plan_code : null;
  const subscriptionCode =
    typeof data.subscription_code === "string" ? data.subscription_code : null;
  const emailToken =
    typeof data.email_token === "string" ? data.email_token : null;
  const customer = data.customer as Record<string, unknown> | undefined;
  const customerCode =
    typeof customer?.customer_code === "string" ? customer.customer_code : null;
  const customerEmail =
    typeof customer?.email === "string" ? customer.email : null;
  const currentPeriodEnd =
    typeof data.next_payment_date === "string" ? data.next_payment_date : null;
  // Best-effort start. `subscription.create` doesn't carry an explicit
  // period_start; `data.createdAt` is the closest signal (the sub was just
  // provisioned, so the current period effectively begins then). The first
  // `invoice.update` will overwrite this with the authoritative value.
  const currentPeriodStart =
    typeof data.createdAt === "string" ? data.createdAt : null;

  if (
    !planCode ||
    !subscriptionCode ||
    !emailToken ||
    !customerCode ||
    !customerEmail
  ) {
    console.warn(
      "[paystack webhook] subscription.create missing required fields",
      {
        hasPlanCode: !!planCode,
        hasSubscriptionCode: !!subscriptionCode,
        hasEmailToken: !!emailToken,
        hasCustomerCode: !!customerCode,
        hasCustomerEmail: !!customerEmail,
      }
    );
    return;
  }

  // Resolve workspace via billing_email. This is the ONE lookup — no
  // ordering-dependent fallbacks needed.
  const { data: workspace, error: wsErr } = await sb
    .from("workspaces")
    .select("id, clerk_org_id")
    .eq("billing_email", customerEmail)
    .maybeSingle();

  if (wsErr) {
    console.error(
      "[paystack webhook] subscription.create: workspace lookup failed:",
      wsErr
    );
    throw wsErr;
  }
  if (!workspace) {
    console.warn(
      `[paystack webhook] subscription.create: no workspace with billing_email=${customerEmail}`
    );
    return;
  }

  const { data: planRow, error: planErr } = await sb
    .from("plans")
    .select("id")
    .eq("plan_code", planCode)
    .maybeSingle();

  if (planErr || !planRow) {
    console.warn(
      `[paystack webhook] subscription.create: plan ${planCode} not in local plans table`
    );
    return;
  }

  const { error: upsertErr } = await sb.from("subscriptions").upsert(
    {
      workspace_id: workspace.id,
      plan_id: planRow.id,
      subscription_code: subscriptionCode,
      customer_code: customerCode,
      email_token: emailToken,
      status: "active",
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "subscription_code" }
  );

  if (upsertErr) {
    console.error("[paystack webhook] subscription upsert failed:", upsertErr);
    throw upsertErr;
  }

  await setPlaClaim(workspace.clerk_org_id, {
    code: planCode,
    status: "active",
  });
}

/**
 * `subscription.disable` — fires on finite-cycle completion (`status:
 * complete`) or an admin/policy disable action. It does NOT fire on
 * user-initiated cancels — those come through as `subscription.not_renew`
 * despite the endpoint being named `/subscription/disable`. It also does NOT
 * fire on failed-renewal dunning — v1 has no dunning; the failed-renewal
 * path lives in `handleInvoicePaymentFailed`, which itself calls
 * `POST /subscription/disable` on Paystack, and Paystack responds to *that*
 * with `subscription.not_renew`, not `subscription.disable`.
 *
 * When this event does fire, the behaviour below is right for the terminal
 * cases it covers: flip local status to 'cancelled', stamp deleted_at, and
 * clear the Clerk pla claim so the gate reappears on the next request.
 */
async function handleSubscriptionDisable(
  sb: ReturnType<typeof createBypassSupabaseClient>,
  data: Record<string, unknown>
): Promise<void> {
  const subscriptionCode =
    typeof data.subscription_code === "string" ? data.subscription_code : null;
  if (!subscriptionCode) {
    console.warn("[paystack webhook] subscription.disable missing subscription_code");
    return;
  }

  const { data: updated, error } = await sb
    .from("subscriptions")
    .update({
      status: "cancelled",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("subscription_code", subscriptionCode)
    .select("workspace_id")
    .maybeSingle();

  if (error) {
    console.error("[paystack webhook] subscription.disable update failed:", error);
    throw error;
  }
  if (!updated) {
    console.warn(
      `[paystack webhook] subscription.disable: no local row for ${subscriptionCode}`
    );
    return;
  }

  const clerkOrgId = await clerkOrgIdFor(sb, updated.workspace_id);
  if (!clerkOrgId) return;

  await setPlaClaim(clerkOrgId, null);
}

/**
 * `invoice.payment_failed` — a renewal charge failed. Per the v1 decision
 * (immediate lockout, no dunning grace), set the Clerk pla claim to a
 * non-active status so the layout gate kicks the user to /subscribe on the
 * next request, AND flip local status to 'past_due'.
 *
 * Also fires `POST /subscription/disable` at Paystack as a best-effort
 * cleanup — Paystack doesn't auto-retry, but without an explicit disable the
 * sub lives on in their dashboard and can silently re-attempt on its next
 * scheduled cycle. Disable is idempotent on Paystack's side, so a retry is
 * always safe. Fire-and-forget: local lockout has already happened, so we
 * never rethrow. Paystack responds to the disable with `subscription.not_renew`
 * (not `subscription.disable` — same quirk as user-initiated cancels).
 *
 * ## Ordering: lockout side effects run BEFORE the local status flip
 *
 * The pla claim update is the actual layout-gate signal, and the Paystack
 * disable is what stops any future retry from Paystack's side. Both run
 * first; the local `status = past_due` write lands last. This ordering is
 * load-bearing under the one-way status rule below: once the local row is
 * no longer `active`, a retried invocation of this handler would be blocked
 * by the guard and would never re-attempt the side effects. Keeping the
 * side effects ahead of the flip means a transient failure (Clerk API 5xx,
 * plan lookup blip) returns 500 with the local row still `active`, and
 * Paystack's retry re-enters and re-runs the side effects. `setPlaClaim`
 * to the same value is idempotent; Paystack's disable is idempotent.
 *
 * ## One-way status rule
 *
 * Only writes when the local row is currently `active`. The final flip is
 * an atomic conditional update (`.eq("status", "active")`) so a concurrent
 * webhook that has already moved the row out of `active` between our fetch
 * and our write cannot be regressed — the update matches zero rows and we
 * log. If Paystack ever delivers this event against a row that's already
 * `past_due` / `non-renewing` / `cancelled`, the top-of-handler guard skips
 * everything — status never walks backward, and we don't re-issue a
 * Paystack disable for a sub that's already terminal on our side.
 */
async function handleInvoicePaymentFailed(
  sb: ReturnType<typeof createBypassSupabaseClient>,
  data: Record<string, unknown>
): Promise<void> {
  const subscription = data.subscription as Record<string, unknown> | undefined;
  const subscriptionCode =
    typeof subscription?.subscription_code === "string"
      ? subscription.subscription_code
      : null;

  if (!subscriptionCode) {
    console.warn(
      "[paystack webhook] invoice.payment_failed missing subscription.subscription_code"
    );
    return;
  }

  const { data: existing, error: fetchErr } = await sb
    .from("subscriptions")
    .select("status, workspace_id, plan_id, email_token")
    .eq("subscription_code", subscriptionCode)
    .maybeSingle();

  if (fetchErr) {
    console.error(
      "[paystack webhook] invoice.payment_failed lookup failed:",
      fetchErr
    );
    throw fetchErr;
  }
  if (!existing) {
    console.warn(
      `[paystack webhook] invoice.payment_failed: no local row for ${subscriptionCode}`
    );
    return;
  }

  if (existing.status !== "active") {
    console.warn(
      `[paystack webhook] invoice.payment_failed: refusing to regress ${subscriptionCode} — local status is '${existing.status}'. One-way status rule.`
    );
    return;
  }

  const [{ data: planRow, error: planErr }, clerkOrgId] = await Promise.all([
    sb.from("plans").select("plan_code").eq("id", existing.plan_id).maybeSingle(),
    clerkOrgIdFor(sb, existing.workspace_id),
  ]);

  if (planErr) {
    console.error(
      "[paystack webhook] invoice.payment_failed: plan lookup failed:",
      planErr
    );
    throw planErr;
  }
  if (clerkOrgId && planRow?.plan_code) {
    await setPlaClaim(clerkOrgId, {
      code: planRow.plan_code,
      status: "past_due",
    });
  }

  // Best-effort Paystack cleanup. `email_token` may be null on very old rows
  // that predate the token column — skip the disable in that case; the local
  // lockout below still stands.
  if (existing.email_token) {
    try {
      const client = createPaystackClient();
      const response = await client.post<PaystackEnvelope<unknown>>(
        "/subscription/disable",
        { code: subscriptionCode, token: existing.email_token }
      );
      if (!response.data.status) {
        console.warn(
          `[paystack webhook] invoice.payment_failed: Paystack disable returned status=false for ${subscriptionCode}: ${response.data.message}`
        );
      }
    } catch (ex) {
      console.error(
        `[paystack webhook] invoice.payment_failed: Paystack disable threw for ${subscriptionCode} — local lockout still holds:`,
        ex
      );
    }
  }

  // Atomic conditional flip. `.eq("status", "active")` closes the TOCTOU
  // gap between the fetch above and this write: if a concurrent handler
  // (e.g. `subscription.not_renew` from our own disable call landing early)
  // has already moved the row out of `active`, the update matches zero rows
  // and we log rather than regressing status.
  const { data: flipped, error: updateErr } = await sb
    .from("subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("subscription_code", subscriptionCode)
    .eq("status", "active")
    .select("status")
    .maybeSingle();

  if (updateErr) {
    console.error(
      "[paystack webhook] invoice.payment_failed update failed:",
      updateErr
    );
    throw updateErr;
  }

  if (!flipped) {
    console.warn(
      `[paystack webhook] invoice.payment_failed: status changed under us for ${subscriptionCode} — pla claim + Paystack disable already ran; leaving local status as-is.`
    );
  }
}

/**
 * `invoice.update` — fires after Paystack attempts a renewal charge on a
 * subscription. Source of truth for period edges: carries both `period_start`
 * and `period_end`, and lands on every renewal (success or failure).
 *
 * ## Only writes when the sub is locally `active`
 *
 * Local subscription status is strictly one-way in v1:
 * `active → past_due → non-renewing → cancelled`. This handler never walks
 * that back. Concretely:
 *
 * - `active` + `data.status === "success"` → advance `current_period_start`
 *   / `current_period_end`. Sole happy path.
 * - `active` + `data.status !== "success"` → documented pass-through.
 *   `invoice.payment_failed` fires in parallel and owns the lockout + Paystack
 *   disable. Kept as a no-op branch so any future divergence between the two
 *   events is obvious.
 * - `past_due` / `non-renewing` / `cancelled` → warn and skip. Once we've
 *   locked the user out and disabled the Paystack sub, no subsequent event
 *   can re-open access. Recovery = re-subscribe (a fresh checkout / new sub
 *   row), never an in-place resurrection of the old row. Paystack is the
 *   source of truth: their disable is terminal, so ours is too.
 */
async function handleInvoiceUpdate(
  sb: ReturnType<typeof createBypassSupabaseClient>,
  data: Record<string, unknown>
): Promise<void> {
  const subscription = data.subscription as Record<string, unknown> | undefined;
  const subscriptionCode =
    typeof subscription?.subscription_code === "string"
      ? subscription.subscription_code
      : null;

  if (!subscriptionCode) {
    console.warn(
      "[paystack webhook] invoice.update missing subscription.subscription_code"
    );
    return;
  }

  const periodStart =
    typeof data.period_start === "string" ? data.period_start : null;
  const periodEnd =
    typeof data.period_end === "string" ? data.period_end : null;
  const invoiceStatus =
    typeof data.status === "string" ? data.status : null;

  // Documented pass-through: invoice.payment_failed owns the failure path.
  if (invoiceStatus !== "success") return;

  // Success invoice with no period edges — payload-shape mismatch worth
  // surfacing. Writing only `updated_at` would silently no-op and hide the
  // fact that the Paystack payload didn't carry what we expected.
  if (!periodStart && !periodEnd) {
    console.warn(
      `[paystack webhook] invoice.update: success invoice for ${subscriptionCode} carried neither period_start nor period_end — skipping without advancing edges.`
    );
    return;
  }

  const updates: Database["public"]["Tables"]["subscriptions"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (periodStart) updates.current_period_start = periodStart;
  if (periodEnd) updates.current_period_end = periodEnd;

  // Atomic conditional update. `.eq("status", "active")` collapses the guard
  // and the write into one statement, closing the TOCTOU gap where a
  // concurrent webhook could flip the row out of `active` between them.
  const { data: updated, error: updateErr } = await sb
    .from("subscriptions")
    .update(updates)
    .eq("subscription_code", subscriptionCode)
    .eq("status", "active")
    .select("status")
    .maybeSingle();

  if (updateErr) {
    console.error("[paystack webhook] invoice.update write failed:", updateErr);
    throw updateErr;
  }

  if (updated) return;

  // No row matched — either the local sub doesn't exist, or its status is
  // no longer `active`. Follow-up read purely for a diagnostic log; the
  // one-way status rule is already enforced by the conditional write above.
  const { data: existing } = await sb
    .from("subscriptions")
    .select("status")
    .eq("subscription_code", subscriptionCode)
    .maybeSingle();

  if (!existing) {
    console.warn(
      `[paystack webhook] invoice.update: no local row for ${subscriptionCode}`
    );
    return;
  }

  console.warn(
    `[paystack webhook] invoice.update: refusing to advance ${subscriptionCode} — local status is '${existing.status}'. Recovery requires a fresh subscription.`
  );
}

// #endregion

// #region ROUTE

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Step 1 — raw body. request.text() reads exactly what Paystack signed.
  const rawBody = await request.text();

  // Step 2 — signature verification.
  const signature = request.headers.get("x-paystack-signature");
  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Step 3 — parse JSON. Malformed body after a valid signature would be a
  // Paystack bug, but handle it anyway.
  let envelope: WebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WebhookEnvelope;
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const event = envelope.event;
  const data = envelope.data ?? {};
  const reference = referenceFor(event, data);

  // Unknown event or missing reference — 200 to prevent retries. We log for
  // observability; Paystack has no way to help us.
  if (!reference) {
    console.warn(
      `[paystack webhook] unknown or unreferenced event: ${event || "(no event)"}`
    );
    return NextResponse.json({ ok: true, note: "no reference" });
  }

  const sb = createBypassSupabaseClient();

  // Step 4 — idempotency. If we've already fully processed this event,
  // short-circuit.
  const { data: existing, error: existingErr } = await sb
    .from("billing_events")
    .select("id, processed_at")
    .eq("provider_event", event)
    .eq("reference", reference)
    .maybeSingle();

  if (existingErr) {
    console.error("[paystack webhook] billing_events lookup failed:", existingErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  if (existing?.processed_at) {
    return NextResponse.json({ ok: true, note: "already processed" });
  }

  // Step 5 — log the event if it's new. Race: two concurrent deliveries of
  // the same event can both reach the INSERT. The DB-level UNIQUE constraint
  // on (provider_event, reference) prevents duplicates; the loser gets 23505
  // (unique_violation), which we treat as "already logged" and continue.
  if (!existing) {
    // envelope is what JSON.parse produced, so it's structurally valid Json —
    // the cast just satisfies Supabase's generated Json type (which is
    // recursive and stricter than `Record<string, unknown>`).
    const { error: insertErr } = await sb.from("billing_events").insert({
      provider_event: event,
      reference,
      payload: envelope as unknown as Json,
    });
    if (insertErr && insertErr.code !== "23505") {
      console.error("[paystack webhook] failed to log event:", insertErr);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }

  // Step 6 — dispatch.
  try {
    // TEST HOOK: setting PAYSTACK_TEST_FORCE_500 to an event name (e.g.
    // "charge.success") forces this handler to return 500 for that event
    // without touching state. Used once, empirically, to verify Paystack's
    // documented retry behavior on non-2xx responses. Inert unless the env
    // var is set — safe to leave in place. Remove or leave the env unset in
    // any environment that isn't actively running the verification test.
    if (process.env.PAYSTACK_TEST_FORCE_500 === event) {
      console.warn(
        `[paystack webhook] TEST HOOK — forcing 500 for event=${event}`
      );
      return NextResponse.json(
        { error: "Forced 500 for retry-verification test" },
        { status: 500 }
      );
    }

    switch (event) {
      case "charge.success":
        await handleChargeSuccess();
        break;
      case "subscription.create":
        await handleSubscriptionCreate(sb, data);
        break;
      case "subscription.not_renew":
        await handleSubscriptionNotRenew(sb, data);
        break;
      case "subscription.disable":
        await handleSubscriptionDisable(sb, data);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(sb, data);
        break;
      case "invoice.update":
        await handleInvoiceUpdate(sb, data);
        break;
      default:
        // Recognized reference but unhandled event — log, still 200 so
        // Paystack doesn't hammer us with retries for events we don't care
        // about.
        console.warn(`[paystack webhook] unhandled event: ${event}`);
        break;
    }
  } catch (ex) {
    // Transient handler failure — 500 so Paystack retries with backoff.
    // billing_events.processed_at stays null; next delivery will re-attempt.
    console.error(`[paystack webhook] handler error for ${event}:`, ex);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Step 7 — mark processed.
  const { error: markErr } = await sb
    .from("billing_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider_event", event)
    .eq("reference", reference);

  if (markErr) {
    console.error("[paystack webhook] failed to mark processed:", markErr);
    // Handler side effects already ran — if we return 500 here, Paystack
    // retries and idempotency will short-circuit at step 4 the second time
    // (assuming the retry lands after our processed_at write eventually
    // succeeds elsewhere). Safest is still to 500 so Paystack knows we're
    // not fully green.
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// #endregion
