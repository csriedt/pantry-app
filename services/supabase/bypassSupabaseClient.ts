import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";

/**
 * The trusted client: the secret key, which BYPASSES RLS. Permitted for
 * exactly two uses, per ADR 0001 — system work (cron, webhooks, purge)
 * and the cached reads whose row selection lives in a `_for` RPC or in a
 * table with no user rows at all. Nothing else, ever: a user-facing read
 * on a policied table that doesn't go through one of those shapes is the
 * thing the repo rules forbid.
 *
 * Server-only by design — `SUPABASE_SECRET_KEY` has no `NEXT_PUBLIC_`
 * prefix, so it never reaches the browser bundle, and the import throws
 * at build time if this module drifts into a client component.
 */
export function createBypassSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  // Read inside the factory: a module-scope read of a secret crashes
  // build-time page data collection on a machine without it.
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in the environment.",
    );
  }

  return createClient<Database>(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
