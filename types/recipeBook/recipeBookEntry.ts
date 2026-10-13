import { z } from "zod";

/**
 * One recipe-book entry. The projection is computed server-side: the
 * itemset ∩ pantry intersection decides feasibility, and `missing` names
 * the gap (the "Nearly there" section's facts). `signal` is the trend
 * artifact's per-recipe metrics — null until a run above the k-anonymity
 * floor exists for the combo.
 */
export const RecipeBookEntrySchema = z.object({
  recipe_id: z.string().uuid(),
  title: z.string().nullable(),
  items: z.array(z.string()),
  missing: z.array(z.string()),
  feasible: z.boolean(),
  signal: z
    .object({
      cooks: z.number().nullable(),
      kitchens: z.number().nullable(),
      repeat_kitchens: z.number().nullable(),
      last_cooked_at: z.string().nullable(),
    })
    .nullable(),
});

export type RecipeBookEntry = z.infer<typeof RecipeBookEntrySchema>;
