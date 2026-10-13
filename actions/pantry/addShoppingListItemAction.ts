"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { AddShoppingListItemPayload } from "@/types/pantry/addShoppingListItemPayload";
import {
  AddShoppingListItemRequest,
  AddShoppingListItemRequestSchema,
} from "@/types/pantry/addShoppingListItemRequest";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

import { invalidatePantryAction } from "./invalidatePantryAction";

/**
 * Store one explicit shopping-list row. `user_id` comes from the session —
 * RLS's with-check requires it to match `auth.uid()`, and Postgres has no
 * way to default it from the token, so the action supplies it.
 *
 * A re-add of a row already on the list surfaces as a 409 (unique) — the
 * UI treats that as "already added".
 */
export async function addShoppingListItemAction(
  input: AddShoppingListItemRequest,
): Promise<AddShoppingListItemPayload> {
  const validation = validateInput(AddShoppingListItemRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const user = await getSessionUser(sb);
    if (!user) {
      return { error: { message: "Not signed in.", code: "unauthorized" } };
    }

    const { data: row, error: sbError } = await sb
      .from("shopping_list_items")
      .insert({
        user_id: user.id,
        food_id: validation.data.food_id,
        source: validation.data.source,
      })
      .select("food_id, source")
      .single();
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't add that to the list."),
      };
    }

    await invalidatePantryAction(user.id);
    return { data: { food_id: row.food_id, source: row.source } };  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't add that to the list.",
    });
  }
  return { error };
}
