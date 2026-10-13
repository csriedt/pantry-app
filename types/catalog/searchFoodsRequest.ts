import { z } from "zod";

import { Food } from "./food";

/**
 * Input for `searchFoodsAction` — the quick-add type-ahead. The query is
 * matched case-insensitively against canonical and normalized names; the
 * caller's own rows rank first (design: autocomplete ranks user rows
 * first).
 */
export const SearchFoodsRequestSchema = z
  .object({
    query: z.string().min(1).max(128),
    limit: z.number().int().min(1).max(50).default(8),
  })
  .strict();

export type SearchFoodsRequest = z.infer<typeof SearchFoodsRequestSchema>;

/** Matching foods, user rows first. */
export type SearchFoodsResponse = {
  foods: Food[];
};
