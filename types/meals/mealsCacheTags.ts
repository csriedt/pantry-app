/**
 * Server-cache tag builders for the meals domain. Meal writes move the
 * pantry too, so the meal actions also invalidate the pantry family —
 * both builders are imported, never inlined.
 */
export const MEALS_TAGS = {
  family: "meals-data",
} as const;

export const mealsDataTag = (userId: string): string =>
  `${MEALS_TAGS.family}:${userId}`;
