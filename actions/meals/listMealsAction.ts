"use server";

import { cacheLife, cacheTag } from "next/cache";

import { createBypassSupabaseClient } from "@/services/supabase/bypassSupabaseClient";
import {
  formatSupabaseError,
  isPostgrestError,
} from "@/services/supabase/formatSupabaseError";
import { getSessionUser } from "@/services/supabase/session";
import { ListMealsPayload } from "@/types/meals/listMealsPayload";
import {
  ListMealsRequest,
  ListMealsRequestSchema,
} from "@/types/meals/listMealsRequest";
import { mapMealRow } from "@/types/meals/meal";
import { mealsDataTag } from "@/types/meals/mealsCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError, getUnauthorizedPayload } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/** The Made meals view: the caller's meals, most recent first. */
export async function listMealsAction(
  input: Partial<ListMealsRequest> = {},
): Promise<ListMealsPayload> {
  const validation = validateInput(ListMealsRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const user = await getSessionUser();
    if (!user) {
      return getUnauthorizedPayload();
    }
    return await listMealsCached(user.id, validation.data.limit);
  } catch (ex) {
    error = isPostgrestError(ex)
      ? formatSupabaseError(ex, "Couldn't read your meals.")
      : formatGenericError(ex, { defaultMessage: "Couldn't read your meals." });
  }
  return { error };
}

/** Unexported: the id arrives only from the session the getter verified. */
async function listMealsCached(
  userId: string,
  limit: number,
): Promise<ListMealsPayload> {
  "use cache";
  cacheTag(mealsDataTag(userId));
  cacheLife("minutes");

  const sb = createBypassSupabaseClient();
  const { data, error } = await sb.rpc("list_meals_for", {
    p_user_id: userId,
    p_limit: limit,
  });
  if (error) throw error;

  return { data: { meals: (data ?? []).map(mapMealRow) } };
}
