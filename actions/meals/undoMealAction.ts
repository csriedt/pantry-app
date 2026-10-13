"use server";

import { updateTag } from "next/cache";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { UndoMealPayload } from "@/types/meals/undoMealPayload";
import {
  UndoMealRequest,
  UndoMealRequestSchema,
} from "@/types/meals/undoMealRequest";
import { UndoMealResponse } from "@/types/meals/undoMealRequest";
import { pantryDataTag } from "@/types/pantry/pantryCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/**
 * The receipt's undo: compensating update on the meal and restore of the
 * booked amounts, in one RPC. Undo moves the pantry, so the pantry
 * family's tag goes too.
 */
export async function undoMealAction(
  input: UndoMealRequest,
): Promise<UndoMealPayload> {
  const validation = validateInput(UndoMealRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb.rpc("undo_meal", {
      p_meal_id: validation.data.meal_id,
    });
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't undo that meal."),
      };
    }

    const user = await getSessionUser(sb);
    if (user) {
      updateTag(pantryDataTag(user.id));
    }

    return { data: { version: data } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't undo that meal.",
    });
  }
  return { error };
}
