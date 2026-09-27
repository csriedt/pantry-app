import { SignIn } from "@clerk/nextjs";
import { Sparkles } from "lucide-react";

/**
 * Clerk sign-in route.
 *
 * ## Post-signin redirect: `fallbackRedirectUrl`, not `forceRedirectUrl`
 *
 * `fallbackRedirectUrl="/dashboard"` — after successful sign-in the
 * user lands in the app rather than back on the landing page
 * (Clerk's default). The `(app)/` layout gate takes over from there:
 * signed-in-and-covered users see the dashboard; signed-in-but-
 * uncovered users get bounced to `/subscribe`.
 *
 * We use **fallback**, not **force**, so the plan-intent handoff
 * still works if a visitor clicks Subscribe on `/pricing`, is sent
 * to sign-up, then clicks "Already have an account?" and lands here
 * instead. Clerk carries the original `redirect_url=/subscribe?plan=X`
 * across that pivot, and this page lets it win — the caller ends up
 * at their intended plan even after a sign-in detour.
 * `forceRedirectUrl` would swallow that param and drop them at
 * `/dashboard` with no memory of what they were trying to do.
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
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
