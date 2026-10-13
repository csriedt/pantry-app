"use server";

import { cacheLife, cacheTag } from "next/cache";

import { getPantrySnapshotAction } from "@/actions/pantry/getPantrySnapshotAction";
import { createBypassSupabaseClient } from "@/services/supabase/bypassSupabaseClient";
import { formatSupabaseError, isPostgrestError } from "@/services/supabase/formatSupabaseError";
import { GetRecipeBookPayload } from "@/types/recipeBook/getRecipeBookPayload";
import {
  GetRecipeBookRequest,
  GetRecipeBookRequestSchema,
} from "@/types/recipeBook/getRecipeBookRequest";
import { RecipeBookEntry } from "@/types/recipeBook/recipeBookEntry";
import { RECIPE_BOOK_TAGS } from "@/types/recipeBook/recipeBookCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/**
 * The recipe book's server-side projection: the (cached, global) recipe
 * catalog intersected with the caller's pantry — feasibility plus the
 * missing items — with the trend artifact's metrics attached where a
 * floored run exists. The client never sees the full ranked set.
 *
 * The deterministic K-sample and session pinning ride on top in the
 * screen-wiring pass; the corpus itself is seeded data, so an empty book
 * is an honest empty state, not an error.
 */
export async function getRecipeBookAction(
  input: GetRecipeBookRequest,
): Promise<GetRecipeBookPayload> {
  const validation = validateInput(GetRecipeBookRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  let error: GenericError | undefined;
  try {
    const [catalog, snapshot] = await Promise.all([
      getRecipeCatalogCached(),
      getPantrySnapshotAction(),
    ]);
    if (snapshot.error || !snapshot.data) {
      return {
        error: snapshot.error ?? { message: "No pantry.", code: "unknown" },
      };
    }

    const held = new Set(snapshot.data.items.map(item => item.food_id));
    const foodName = new Map(
      catalog.foods.map(food => [food.id, food.canonical_name]),
    );
    const signal = new Map(catalog.trends.map(row => [row.recipe_id, row]));

    // ingredients grouped per recipe, in a stable order.
    const perRecipe = new Map<string, { food_id: string; name: string }[]>();
    for (const row of catalog.ingredients) {
      const entry = {
        food_id: row.food_id,
        name: foodName.get(row.food_id) ?? "Unknown item",
      };
      perRecipe.set(row.recipe_id, [
        ...(perRecipe.get(row.recipe_id) ?? []),
        entry,
      ]);
    }

    const entries: RecipeBookEntry[] = catalog.recipes.map(recipe => {
      const components = perRecipe.get(recipe.id) ?? [];
      const missing = components
        .filter(component => !held.has(component.food_id))
        .map(component => component.name);
      const metrics = signal.get(recipe.id);
      return {
        recipe_id: recipe.id,
        title: recipe.title,
        items: components.map(component => component.name),
        missing,
        feasible: missing.length === 0,
        signal: metrics
          ? {
              cooks: metrics.cooks,
              kitchens: metrics.kitchens,
              repeat_kitchens: metrics.repeat_kitchens,
              last_cooked_at: metrics.last_cooked_at,
            }
          : null,
      };
    });

    // "popular" is signal-backed only — unfloored combos are not published.
    const filtered =
      validation.data.view === "popular"
        ? entries.filter(entry => entry.signal !== null)
        : entries;

    return { data: { entries: filtered } };
  } catch (ex) {
    error = isPostgrestError(ex)
      ? formatSupabaseError(ex, "Couldn't read the recipe book.")
      : formatGenericError(ex, {
          defaultMessage: "Couldn't read the recipe book.",
        });
  }
  return { error };
}

/** The global catalog half — no user anywhere in it, so it caches cleanly. */
type RecipeCatalog = {
  recipes: { id: string; title: string | null }[];
  ingredients: { recipe_id: string; food_id: string }[];
  foods: { id: string; canonical_name: string }[];
  trends: {
    recipe_id: string;
    cooks: number | null;
    kitchens: number | null;
    repeat_kitchens: number | null;
    last_cooked_at: string | null;
  }[];
};

async function getRecipeCatalogCached(): Promise<RecipeCatalog> {
  "use cache";
  cacheTag(RECIPE_BOOK_TAGS.catalog);
  cacheLife("hours");

  const sb = createBypassSupabaseClient();

  const [recipes, ingredients, foods, latestRun] = await Promise.all([
    sb.from("recipes").select("id, title").is("superseded_by", null),
    sb.from("recipe_ingredients").select("recipe_id, food_id"),
    sb.from("foods").select("id, canonical_name"),
    sb
      .from("recipe_trend_runs")
      .select("id")
      .eq("status", "ok")
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (recipes.error || foods.error || latestRun.error || ingredients.error) {
    throw (
      recipes.error ??
      foods.error ??
      latestRun.error ??
      ingredients.error!
    );
  }

  let trends: RecipeCatalog["trends"] = [];
  if (latestRun.data) {
    const { data: trendRows, error: trendsError } = await sb
      .from("recipe_trends")
      .select("recipe_id, cooks, kitchens, repeat_kitchens, last_cooked_at")
      .eq("run_id", latestRun.data.id);
    if (trendsError) throw trendsError;
    trends = trendRows ?? [];
  }

  return {
    recipes: recipes.data ?? [],
    ingredients: ingredients.data ?? [],
    foods: foods.data ?? [],
    trends,
  };
}
