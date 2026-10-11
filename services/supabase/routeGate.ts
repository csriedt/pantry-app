/**
 * Deny-by-default route gate for the proxy. Pure — no request, no
 * cookies — so the policy is unit-testable (tests/authGate.test.ts).
 */

const AUTH_ROUTES = ["/sign-in", "/sign-up"];
const APP_HOME = "/pantry";
const SIGN_IN = "/sign-in";

export type Gate = { redirect: string } | null;

export function gateRoute(pathname: string, isSignedIn: boolean): Gate {
  const on = (routes: string[]) =>
    routes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );

  // A signed-in user on an auth page belongs in the app.
  if (on(AUTH_ROUTES)) return isSignedIn ? { redirect: APP_HOME } : null;

  // Everything else is locked by default: a forgotten route fails safe.
  return isSignedIn ? null : { redirect: SIGN_IN };
}
