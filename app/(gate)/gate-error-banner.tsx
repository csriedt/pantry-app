"use client";

import { AlertTriangle } from "lucide-react";
import { useSearchParams } from "next/navigation";

/**
 * Renders a small banner when a page under (gate)/ has been reached
 * with `?error=<code>`. The callback page redirects to
 * `/subscribe?error=...` on any failure path (missing reference, verify
 * failed, workspace mismatch, etc.), so the pricing page (once it
 * lands) will pick these up automatically via this layout.
 *
 * Kept client-side so it can read searchParams without the whole
 * layout opting into dynamic rendering (layouts can't read searchParams
 * directly in Next 16 — that's a page-only API).
 */

// #region DATA

const MESSAGES: Record<string, string> = {
  missing_reference:
    "That subscription link was incomplete. Please try starting checkout again.",
  verify_failed:
    "We couldn't verify that transaction with Paystack. Please try again.",
  no_workspace:
    "Your workspace isn't set up yet. If you just signed up, give it a moment; otherwise contact support.",
  missing_metadata:
    "That transaction is missing workspace details we need to verify it. Please start checkout again.",
  workspace_mismatch:
    "That transaction belongs to a different workspace. Please start checkout from your own account.",
  missing_plan:
    "That transaction is missing plan information. Please try starting checkout again.",
  failed:
    "The payment did not go through. Please try again with a different card.",
  abandoned:
    "The checkout was abandoned before payment completed. Please try again.",
  reversed:
    "That payment was reversed. Please contact support if this was unexpected.",
};

// #endregion

// #region VIEW

export function GateErrorBanner() {
  const params = useSearchParams();
  const code = params.get("error");
  if (!code) return null;

  const message = MESSAGES[code] ?? "Something went wrong. Please try again.";

  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 text-destructive flex w-full max-w-md items-start gap-2.5 rounded-md border px-4 py-3">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

// #endregion
