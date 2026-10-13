"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { UpsertPantryItemPayload } from "@/types/pantry/upsertPantryItemPayload";
import {
  UpsertPantryItemRequest,
  UpsertPantryItemRequestSchema,
  withDefaultStockState,
} from "@/types/pantry/upsertPantryItemRequest";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

import { invalidatePantryAction } from "./invalidatePantryAction";

/**
 * Set one pantry row — counted (amount/unit) or level (stock_state) mode —
 * and bump the doorbell in the same RPC. Decision A's default (neither
 * supplied → `stock_state: "stocked"`) is applied here, not in the RPC.
 */
export async function upsertPantryItemAction(
  input: UpsertPantryItemRequest,
): Promise<UpsertPantryItemPayload> {
  const validation = validateInput(UpsertPantryItemRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  const request = withDefaultStockState(validation.data);

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb.rpc("upsert_pantry_item", {
      p_food_id: request.food_id,
      p_amount: request.amount ?? undefined,
      p_unit: request.unit ?? undefined,
      p_stock_state: request.stock_state ?? undefined,
    });
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't update the pantry."),
      };
    }

    const user = await getSessionUser(sb);
    if (user) await invalidatePantryAction(user.id);
    return { data: { version: data } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't update the pantry.",
    });
  }
  return { error };
}
