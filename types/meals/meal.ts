import { z } from "zod";

/**
 * A meal row — the record for meals: identity (the recipe) plus the
 * ledger (the deductions actually booked). Append-only except the undo
 * flag; never a read source of truth.
 */
export const MealSchema = z.object({
  id: z.string().uuid(),
  recipe_id: z.string().uuid(),
  at: z.string(),
  booked: z.array(
    z.object({
      food_id: z.string().uuid(),
      amount: z.number(),
      unit: z.string().nullable(),
    }),
  ),
  writer: z.enum(["user", "ai", "cron"]),
  undone_at: z.string().nullable(),
});

export type Meal = z.infer<typeof MealSchema>;
export type BookedDeduction = Meal["booked"][number];

/** Parse one wire row from a `meals` select. */
export function mapMealRow(row: unknown): Meal {
  return MealSchema.parse(row);
}
