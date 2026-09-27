"use client";

import { useSession } from "@clerk/nextjs";
import * as React from "react";

/**
 * Success-page content shown after `/transaction/verify` returns
 * `success`. Branding shell (background, logo header) comes from the
 * shared `(gate)` layout.
 *
 * The server component sibling (`page.tsx`) has already:
 *   - verified the transaction
 *   - cross-checked metadata.workspace_id
 *   - written the fresh `pla` claim to the caller's Clerk org
 *
 * This client component's only job is to close the loop on the browser
 * side: refresh the Clerk session so the JWT cookie picks up the new
 * claim, then bounce the user into the app after a short beat. Without
 * `session.reload()` the cookie stays stale and the layout gate on
 * `/dashboard` would read the pre-callback claim and kick the user
 * back to /subscribe.
 *
 * ## Why refs + `hasRunRef` guard
 *
 * `useSession()` returns a new session reference whenever internal
 * state changes — including the state change caused by `reload()`
 * itself. If we put `session` in the effect deps, `reload()` mutates
 * state → effect cleanup → effect re-runs → we call `reload()` again
 * → infinite loop, timeout never fires. Ref-holding the session and
 * one-shot-guarding via `hasRunRef` runs the flow exactly once even
 * as Clerk's session identity churns.
 *
 * ## Why `window.location.assign` instead of `router.push`
 *
 * `router.push` triggers a soft navigation that reuses the current
 * cookie state via Next's client cache. If Clerk hasn't fully
 * propagated the fresh JWT cookie by the time the layout gate reads
 * it server-side, the gate bounces the user back to `/subscribe`.
 * `window.location.assign` forces a hard HTTP request, guaranteeing
 * the middleware picks up whatever cookie Clerk has most recently
 * written. Matches the subscribe flow's off-domain redirect pattern.
 */

// #region VIEW

export function CallbackSuccessClient() {
  const { session, isLoaded } = useSession();

  // Session identity churns on `reload()` — hold it in a ref so the
  // effect's deps don't include it (see docstring). Sync the ref in
  // its own effect rather than during render to satisfy the
  // react-hooks/refs rule (no ref writes in render bodies).
  const sessionRef = React.useRef(session);
  React.useEffect(() => {
    sessionRef.current = session;
  });

  // Ensures the reload+navigate flow runs exactly once even if the
  // component re-renders (which it will, thanks to useSession state
  // churn during reload).
  const hasRunRef = React.useRef(false);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        await sessionRef.current?.reload();
      } catch (ex) {
        console.error("[subscription callback] session.reload() failed:", ex);
      }
      if (cancelled) return;
      timeoutId = setTimeout(() => {
        // Hard navigation — see docstring. Belt-and-braces against
        // Clerk cookie propagation timing.
        window.location.assign("/dashboard");
      }, 1500);
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoaded]);

  // Self-centered — the (gate) layout no longer centers children so
  // width-varying pages (like /subscribe) can render full-width bands. See
  // `app/(gate)/layout.tsx` docstring for the tradeoff.
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-foreground text-2xl font-bold tracking-tight">
        Subscription active
      </h1>
      <p className="text-muted-foreground text-sm">
        Getting your workspace ready…
      </p>
    </div>
  );
}

// #endregion
