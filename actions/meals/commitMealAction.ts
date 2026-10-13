"use server";

import { updateTag } from "next/cache";

import { getPantrySnapshotAction } from "@/actions/pantry/getPantrySnapshotAction";
import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { CommitMealPayload } from "@/types/meals/commitMealPayload";
import {
  CommitMealRequest,
  CommitMealRequestSchema,
} from "@/types/meals/commitMealRequest";
import {
  CommitConversion,
  computeMealCommit,
} from "@/types/meals/mealCommit";
import { mealsDataTag } from "@/types/meals/mealsCacheTags";
import { pantryDataTag } from "@/types/pantry/pantryCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/**
 * "Made it": compute what is actually deductible against current state
 * (the server recomputes at commit time — any divergence since the
 * preview shows up in the receipt, never silently), book it through the
 * RPC, and invalidate both families: the commit moves the pantry.
 */
export async function commitMealAction(
  input: CommitMealRequest,
): Promise<CommitMealPayload> {
  const validation = validateInput(CommitMealRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();

    const [ingredients, snapshot, foods] = await Promise.all([
      sb
        .from("recipe_ingredients")
        .select("food_id, amount, unit")
        .eq("recipe_id", validation.data.recipe_id),
      getPantrySnapshotAction(),
      sb.from("foods").select("id, density_g_per_ml, pack_sizes"),
    ]);

    if (ingredients.error) {
      return {
        error: formatSupabaseError(
          ingredients.error,
          "Couldn't read that recipe.",
        ),
      };
    }
    if (foods.error) {
      return {
        error: formatSupabaseError(foods.error, "Couldn't read that recipe."),
      };
    }
    if (snapshot.error || !snapshot.data) {
      return { error: snapshot.error ?? { message: "No pantry.", code: "unknown" } };
    }

    const conversions: Record<string, CommitConversion> = {};
    for (const food of foods.data ?? []) {
      conversions[food.id] = {
        density_g_per_ml: food.density_g_per_ml,
        pack_sizes: food.pack_sizes as CommitConversion["pack_sizes"],
      };
    }

    const plan = computeMealCommit(
      (ingredients.data ?? []).map(row => ({
        food_id: row.food_id,
        amount: Number(row.amount),
        unit: row.unit,
      })),
      snapshot.data.items.map(item => ({
        food_id: item.food_id,
        amount: item.amount,
        unit: item.unit,
        stock_state: item.stock_state,
      })),
      conversions,
    );

    const { data: commit, error: sbError } = await sb.rpc("commit_meal", {
      p_recipe_id: validation.data.recipe_id,
      p_booked: plan.booked,
    });
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't record that meal."),
      };
    }

    const result = commit as { meal_id: string; version: number };
    const user = await getSessionUser(sb);
    if (user) {
      updateTag(pantryDataTag(user.id));
      updateTag(mealsDataTag(user.id));
    }

    return {
      data: {
        meal_id: result.meal_id,
        booked: plan.booked,
        skipped: plan.skipped,
        version: result.version,
      },
    };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't record that meal.",
    });
  }
  return { error };
}
