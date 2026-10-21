import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/db/database.types";

import { createRlsSupabaseClient } from "./rlsSupabaseClient";
import { gateRoute } from "./routeGate";

export type SessionUser = Pick<User, "id" | "email">;

/**
 * The one place a session becomes a user. Reads the cookie locally, then
 * verifies the access token's claims against the cached JWKS — the same
 * signed JWT PostgREST already trusts for RLS, so anything built on this
 * id is RLS-backstopped. Asymmetric keys keep the common path local;
 * symmetric projects fall back to the Auth server inside `getClaims`.
 * Reading `session.user` here would trip the SDK's unverified-storage
 * warning on the server; the claims path verifies instead.
 *
 * Every action that needs identity (the ids it must supply on insert, the
 * cache tags it must build) resolves it here. Inline auth reads in
 * actions are drift. Pass a client the caller already holds to avoid a
 * second one.
 *
 * Reach for the Auth server's verification (`sb.auth.getUser()`) when the
 * decision depends on revocation freshness rather than identity.
 */
export async function getSessionUser(
  sb?: SupabaseClient<Database>,
): Promise<SessionUser | null> {
  const client = sb ?? (await createRlsSupabaseClient());
  const { data, error } = await client.auth.getClaims();

  if (!error && !data) return null;

  if (error || !data?.claims.sub) {
    // A JWKS hiccup or key rotation must not read as a signed-out user.
    const { data: userData } = await client.auth.getUser();
    return userData.user
      ? { id: userData.user.id, email: userData.user.email }
      : null;
  }

  return { id: data.claims.sub, email: data.claims.email };
}

/**
 * Refreshes the Supabase session on every matched request and applies the
 * deny-by-default gate. The refresh is the load-bearing half: without it
 * the access token expires while the user browses.
 */
export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the environment.",
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the token with the auth server, so a revoked or
  // expired session cannot slip through the gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const gate = gateRoute(request.nextUrl.pathname, Boolean(user));
  if (gate) {
    const redirect = NextResponse.redirect(new URL(gate.redirect, request.url));
    // Carry any refreshed session cookies across the redirect.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
