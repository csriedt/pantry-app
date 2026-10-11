"use server";

import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { AuthPayload } from "@/types/auth/authPayload";
import { SignInRequest, SignInRequestSchema } from "@/types/auth/signInRequest";
import { GenericError } from "@/types/service/errors";

export async function signInAction(
  input: SignInRequest,
): Promise<AuthPayload> {
  const validation = validateInput(SignInRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { error: authError } = await sb.auth.signInWithPassword({
      email: validation.data.email,
      password: validation.data.password,
    });
    if (authError) {
      // Deny-by-default: never echo the auth server's message verbatim.
      return {
        error: formatGenericError(authError, {
          defaultMessage: "Those credentials didn't work.",
        }),
      };
    }
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Sign-in failed. Try again.",
    });
  }
  if (error) return { error };

  // Success is the caller's signal to navigate — the session cookie is
  // already written, and the proxy keeps it fresh from the next request.
  return { data: { ok: true } };
}
