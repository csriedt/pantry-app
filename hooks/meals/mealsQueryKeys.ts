/**
 * React Query key builders for the meals domain. Meal commits move the
 * pantry, so the commit/undo mutations invalidate both key families.
 */

const MEALS = "meals" as const;

export const mealsRoot = (userId: string | null) => [MEALS, userId] as const;

export const mealsListKey = (
  userId: string | null,
  limit: number,
) => [MEALS, userId, "list", limit] as const;
