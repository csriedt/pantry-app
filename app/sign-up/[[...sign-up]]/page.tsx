import { SignUp } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";

/**
 * Clerk sign-up route.
 *
 * ## Post-signup redirect: `fallbackRedirectUrl`, not `forceRedirectUrl`
 *
 * `fallbackRedirectUrl="/dashboard"` — after a successful sign-up we
 * push the user into the app rather than dropping them back on the
 * landing page (Clerk's default). The `(app)/` layout gate takes over
 * from there: a freshly-signed-up user won't have a `pla` claim yet,
 * so the gate bounces them to `/subscribe` where the billing-email +
 * pick-a-plan flow kicks in.
 *
 * We use **fallback**, not **force**, because the pricing → sign-up
 * → subscribe funnel needs to override this destination on a
 * per-visit basis. When a visitor clicks Subscribe on `/pricing`, we
 * link them here as `/sign-up?redirect_url=/subscribe?plan=<code>`;
 * Clerk preserves the `redirect_url` search param through its
 * multi-step sign-up UI and drops the caller straight at
 * `/subscribe?plan=<code>` on completion — skipping the dashboard
 * bounce entirely. `forceRedirectUrl` would ignore that param, which
 * defeats the whole plan-intent handoff.
 *
 * Intended chains:
 *   - Direct sign-up (no plan intent):
 *     sign-up → dashboard attempt → gate → subscribe → payment →
 *     dashboard.
 *   - Pricing-carrying sign-up:
 *     pricing → sign-up?redirect_url=/subscribe?plan=X → subscribe
 *     (pre-selected) → payment → dashboard.
 */
export default function Page() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
          <Sparkles className="size-5" />
        </span>
        <span className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
          previous-app
        </span>
      </div>
      <SignUp fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
