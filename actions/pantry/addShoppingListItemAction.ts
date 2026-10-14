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
import { formatGenericError, getUnauthorizedPayload } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

import { invalidatePantryAction } from "./invalidatePantryAction";

/**
 * Store one explicit shopping-list row — and bump the doorbell in the same
 * RPC, because the list rides inside the snapshot envelope: a list add is
 * a dashboard change, and every other write already rings that bell
 * (decision C). Re-adding a held food surfaces as a 409 (unique) — the
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
      return getUnauthorizedPayload();
    }

    const { data, error: sbError } = await sb.rpc("add_shopping_list_item", {
      p_food_id: validation.data.food_id,
      p_source: validation.data.source,
    });
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't add that to the list."),
      };
    }

    await invalidatePantryAction(user.id);
    return { data: { version: data } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't add that to the list.",
    });
  }
  return { error };
}
