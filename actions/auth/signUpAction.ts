"use server";

import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { AuthPayload } from "@/types/auth/authPayload";
import { SignUpRequest, SignUpRequestSchema } from "@/types/auth/signUpRequest";
import { GenericError } from "@/types/service/errors";

export async function signUpAction(
  input: SignUpRequest,
): Promise<AuthPayload> {
  const validation = validateInput(SignUpRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { error: authError } = await sb.auth.signUp({
      email: validation.data.email,
      password: validation.data.password,
    });
    if (authError) {
      return {
        error: formatGenericError(authError, {
          defaultMessage: "Couldn't create that account.",
        }),
      };
    }
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Sign-up failed. Try again.",
    });
  }
  if (error) return { error };

  // With email confirmation off on the dev project, signUp returns a live
  // session — the caller navigates straight into the app.
  return { data: { ok: true } };
}
