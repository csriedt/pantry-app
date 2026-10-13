"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { ListMealsPayload } from "@/types/meals/listMealsPayload";
import {
  ListMealsRequest,
  ListMealsRequestSchema,
} from "@/types/meals/listMealsRequest";
import { mapMealRow } from "@/types/meals/meal";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/** The Made meals view: the caller's meals, most recent first. */
export async function listMealsAction(
  input: Partial<ListMealsRequest> = {},
): Promise<ListMealsPayload> {
  const validation = validateInput(ListMealsRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb
      .from("meals")
      .select("id, recipe_id, at, booked, writer, undone_at")
      .order("at", { ascending: false })
      .limit(validation.data.limit);
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't read your meals."),
      };
    }

    return { data: { meals: (data ?? []).map(mapMealRow) } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't read your meals.",
    });
  }
  return { error };
}
