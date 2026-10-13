/**
 * React Query key builders for the recipe book. The two views are
 * user-independent reads (RLS scopes them), so the view is the only
 * variable.
 */

const RECIPE_BOOK = "recipe-book" as const;

export const recipeBookKey = (view: "your-pantry" | "popular") =>
  [RECIPE_BOOK, view] as const;
