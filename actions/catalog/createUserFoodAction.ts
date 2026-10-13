"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { CreateUserFoodPayload } from "@/types/catalog/createUserFoodPayload";
import {
  CreateUserFoodRequest,
  CreateUserFoodRequestSchema,
} from "@/types/catalog/createUserFoodRequest";
import { mapFoodRow } from "@/types/catalog/food";
import { GenericError } from "@/types/service/errors";
import { formatGenericError, getUnauthorizedPayload } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/**
 * Create-on-miss: an unmatched quick-add name becomes a private user row
 * (`scope: 'user'`, `owner_id` from the session — RLS's with-check
 * requires it and Postgres can't default it from the token). A unique
 * collision resolves to the existing row, so the action is idempotent and
 * the quick-add flow never dead-ends on "already added".
 */
export async function createUserFoodAction(
  input: CreateUserFoodRequest,
): Promise<CreateUserFoodPayload> {
  const validation = validateInput(CreateUserFoodRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  const normalizedName = validation.data.canonical_name
    .toLowerCase()
    .trim();

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const user = await getSessionUser(sb);
    if (!user) {
      return getUnauthorizedPayload();
    }

    const { data, error: sbError } = await sb
      .from("foods")
      .insert({
        scope: "user",
        owner_id: user.id,
        canonical_name: validation.data.canonical_name,
        normalized_name: normalizedName,
      })
      .select("id, canonical_name, category_id, scope")
      .single();

    if (!sbError) {
      return { data: { food: mapFoodRow(data) } };
    }

    // 23505 = unique (scope, owner_id, normalized_name): the row already
    // exists, so hand it back instead of failing the flow.
    if (sbError.code === "23505") {
      const { data: existing } = await sb
        .from("foods")
        .select("id, canonical_name, category_id, scope")
        .eq("scope", "user")
        .eq("normalized_name", normalizedName)
        .maybeSingle();
      if (existing) return { data: { food: mapFoodRow(existing) } };
    }

    return {
      error: formatSupabaseError(sbError, "Couldn't save that food."),
    };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't save that food.",
    });
  }
  return { error };
}
