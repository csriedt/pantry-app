import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/database.types";

import { invalidatePantryAction } from "./invalidatePantryAction";

/**
 * Resolve the session user from the write's own client and invalidate
 * their pantry cache entry. Every write action calls this after a
 * successful write (every writer invalidates).
 */
export async function invalidateForSession(
  sb: SupabaseClient<Database>,
): Promise<void> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user) await invalidatePantryAction(user.id);
}
