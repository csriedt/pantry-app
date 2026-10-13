import { z } from "zod";

/**
 * Input for `listMealsAction` — the Made meals view is a capped recent
 * list (no pagination controls in the UI), not a paged listing.
 */
export const ListMealsRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(100),
  })
  .strict();

export type ListMealsRequest = z.infer<typeof ListMealsRequestSchema>;
