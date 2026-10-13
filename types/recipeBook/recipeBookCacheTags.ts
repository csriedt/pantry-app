/**
 * Server-cache tag builders for the recipe book. The catalog half is
 * global reference data; the pantry intersection is per-user and reads
 * through the pantry action.
 */
export const RECIPE_BOOK_TAGS = {
  catalog: "recipe-book-catalog",
} as const;
