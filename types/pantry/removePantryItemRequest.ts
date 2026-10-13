import { z } from "zod";

export const RemovePantryItemRequestSchema = z
  .object({
    food_id: z.string().uuid(),
  })
  .strict();

export type RemovePantryItemRequest = z.infer<
  typeof RemovePantryItemRequestSchema
>;

/** The current version — unchanged when the row wasn't there to remove. */
export type RemovePantryItemResponse = {
  version: number;
};
