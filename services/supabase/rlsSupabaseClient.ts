import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/db/database.types";

/**
 * The in-boundary Supabase client: session cookie → JWT, so RLS gates
 * every query (see `lib/db/AGENTS.md` for the policy rules). Server-only;
 * there is no browser client — all calls run here. Never substitute the
 * secret key: that is `createBypassSupabaseClient`, outside RLS, later.
 */
export async function createRlsSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the environment.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components can't write cookies — the proxy refresh owns
        // that; from a render the throw is expected, in an action it lands.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component — safe to ignore.
        }
      },
    },
  });
}
