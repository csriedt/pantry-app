"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { CheckoffShoppingListItemPayload } from "@/types/pantry/checkoffShoppingListItemPayload";
import {
  CheckoffShoppingListItemRequest,
  CheckoffShoppingListItemRequestSchema,
} from "@/types/pantry/checkoffShoppingListItemRequest";
import { withDefaultStockState } from "@/types/pantry/upsertPantryItemRequest";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

import { invalidatePantryAction } from "./invalidatePantryAction";

/**
 * "I have it again": write the pantry row, clear the list row, bump the
 * doorbell — all in one RPC. Decision A's default applies as on the
 * upsert.
 */
export async function checkoffShoppingListItemAction(
  input: CheckoffShoppingListItemRequest,
): Promise<CheckoffShoppingListItemPayload> {
  const validation = validateInput(
    CheckoffShoppingListItemRequestSchema,
    input,
  );
  if (!validation.success) return { error: validation.error };

  const request = withDefaultStockState(validation.data);

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb.rpc("checkoff_shopping_item", {
      p_food_id: request.food_id,
      p_amount: request.amount ?? undefined,
      p_unit: request.unit ?? undefined,
      p_stock_state: request.stock_state ?? undefined,
    });
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't check that off."),
      };
    }

    const user = await getSessionUser(sb);
    if (user) await invalidatePantryAction(user.id);
    return { data: { version: data } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't check that off.",
    });
  }
  return { error };
}
