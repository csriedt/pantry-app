"use server";

import { getPantrySnapshotAction } from "@/actions/pantry/getPantrySnapshotAction";
import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { GetRecipeBookPayload } from "@/types/recipeBook/getRecipeBookPayload";
import {
  GetRecipeBookRequest,
  GetRecipeBookRequestSchema,
} from "@/types/recipeBook/getRecipeBookRequest";
import { RecipeBookEntry } from "@/types/recipeBook/recipeBookEntry";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/**
 * The recipe book's server-side projection: recipes joined against the
 * caller's pantry (feasibility + the missing items), with the trend
 * artifact's metrics attached where a floored run exists. The client
 * never sees the full ranked set — the projection filters and presents.
 *
 * The deterministic K-sample and session pinning ride on top of this read
 * in the screen-wiring pass; the corpus itself is seeded data, so an empty
 * book is an honest empty state, not an error.
 */
export async function getRecipeBookAction(
  input: GetRecipeBookRequest,
): Promise<GetRecipeBookPayload> {
  const validation = validateInput(GetRecipeBookRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();

    const [recipes, ingredients, foods, snapshot, latestRun] =
      await Promise.all([
        sb.from("recipes").select("id, title").is("superseded_by", null),
        sb.from("recipe_ingredients").select("recipe_id, food_id"),
        sb.from("foods").select("id, canonical_name"),
        getPantrySnapshotAction(),
        sb
          .from("recipe_trend_runs")
          .select("id")
          .eq("status", "ok")
          .order("computed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (recipes.error || foods.error || latestRun.error || ingredients.error) {
      return {
        error: formatSupabaseError(
          recipes.error ??
            foods.error ??
            latestRun.error ??
            ingredients.error!,
          "Couldn't read the recipe book.",
        ),
      };
    }
    if (snapshot.error || !snapshot.data) {
      return {
        error: snapshot.error ?? {
          message: "No pantry.",
          code: "unknown",
        },
      };
    }

    const held = new Set(snapshot.data.items.map(item => item.food_id));
    const foodName = new Map(
      (foods.data ?? []).map(food => [food.id, food.canonical_name]),
    );

    // ingredients grouped per recipe, in a stable order.
    const perRecipe = new Map<string, { food_id: string; name: string }[]>();
    for (const row of ingredients.data ?? []) {
      const entry = {
        food_id: row.food_id,
        name: foodName.get(row.food_id) ?? "Unknown item",
      };
      perRecipe.set(row.recipe_id, [
        ...(perRecipe.get(row.recipe_id) ?? []),
        entry,
      ]);
    }

    const signalByRecipe = new Map<string, RecipeBookEntry["signal"]>();
    if (latestRun.data) {
      const { data: trendRows } = await sb
        .from("recipe_trends")
        .select(
          "recipe_id, cooks, kitchens, repeat_kitchens, last_cooked_at",
        )
        .eq("run_id", latestRun.data.id);
      for (const row of trendRows ?? []) {
        signalByRecipe.set(row.recipe_id, {
          cooks: row.cooks,
          kitchens: row.kitchens,
          repeat_kitchens: row.repeat_kitchens,
          last_cooked_at: row.last_cooked_at,
        });
      }
    }

    const entries: RecipeBookEntry[] = (recipes.data ?? []).map(recipe => {
      const components = perRecipe.get(recipe.id) ?? [];
      const missing = components
        .filter(component => !held.has(component.food_id))
        .map(component => component.name);
      return {
        recipe_id: recipe.id,
        title: recipe.title,
        items: components.map(component => component.name),
        missing,
        feasible: missing.length === 0,
        signal: signalByRecipe.get(recipe.id) ?? null,
      };
    });

    // "popular" is signal-backed only — unfloored combos are not published.
    const filtered =
      validation.data.view === "popular"
        ? entries.filter(entry => entry.signal !== null)
        : entries;

    return { data: { entries: filtered } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't read the recipe book.",
    });
  }
  return { error };
}
