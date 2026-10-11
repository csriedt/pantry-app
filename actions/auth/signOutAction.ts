"use server";

import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { AuthPayload } from "@/types/auth/authPayload";

export async function signOutAction(): Promise<AuthPayload> {
  const sb = await createRlsSupabaseClient();
  await sb.auth.signOut();
  return { data: { ok: true } };
}
