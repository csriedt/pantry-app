import { z } from "zod";

/**
 * Input for `commitMealAction` — "Made it". The deductions are computed
 * server-side against current state (commensurability is domain logic),
 * so the request carries only the recipe.
 */
export const CommitMealRequestSchema = z
  .object({
    recipe_id: z.string().uuid(),
  })
  .strict();

export type CommitMealRequest = z.infer<typeof CommitMealRequestSchema>;

/**
 * The receipt: the meal row's identity (for undo), what was actually
 * booked, what was skipped and why, and the new doorbell version.
 */
export type CommitMealResponse = {
  meal_id: string;
  booked: { food_id: string; amount: number; unit: string | null }[];
  skipped: { food_id: string; reason: string }[];
  version: number;
};
