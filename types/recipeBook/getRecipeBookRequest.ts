import { z } from "zod";

import type { RecipeBookEntry } from "./recipeBookEntry";

/**
 * Input for `getRecipeBookAction`. The "made" tab is the meals list
 * (`listMealsAction`), not this read — it replays the user's own meals.
 */
export const GetRecipeBookRequestSchema = z
  .object({
    view: z.enum(["your-pantry", "popular"]),
  })
  .strict();

export type GetRecipeBookRequest = z.infer<typeof GetRecipeBookRequestSchema>;

/** The projected entries the screen samples and pins. */
export type GetRecipeBookResponse = {
  entries: RecipeBookEntry[];
};
