"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { RemovePantryItemPayload } from "@/types/pantry/removePantryItemPayload";
import {
  RemovePantryItemRequest,
  RemovePantryItemRequestSchema,
} from "@/types/pantry/removePantryItemRequest";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

import { invalidatePantryAction } from "./invalidatePantryAction";

/**
 * Remove one pantry row (the sheet's Remove). The RPC bumps the doorbell
 * only when a row actually went; the returned version is the current one
 * either way.
 */
export async function removePantryItemAction(
  input: RemovePantryItemRequest,
): Promise<RemovePantryItemPayload> {
  const validation = validateInput(RemovePantryItemRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb.rpc("remove_pantry_item", {
      p_food_id: validation.data.food_id,
    });
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't remove that item."),
      };
    }

    const user = await getSessionUser(sb);
    if (user) await invalidatePantryAction(user.id);
    return { data: { version: data } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't remove that item.",
    });
  }
  return { error };
}
