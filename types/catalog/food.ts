import { z } from "zod";

/**
 * A foods row as the service layer exposes it. `scope` tells the UI whose
 * row it is ("yours" vs global) — `owner_id` never leaves the server.
 */
export const FoodSchema = z.object({
  id: z.string().uuid(),
  canonical_name: z.string().min(1),
  category_id: z.string().uuid().nullable(),
  scope: z.enum(["global", "user"]),
});

export type Food = z.infer<typeof FoodSchema>;

/** Parse one wire row from a `foods` select. */
export function mapFoodRow(row: unknown): Food {
  return FoodSchema.parse(row);
}
