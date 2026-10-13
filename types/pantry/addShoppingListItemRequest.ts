import { z } from "zod";

/**
 * Input for `addShoppingListItemAction` — an explicit add only (manual, or
 * a recipe gap's "+"). Derived rows are never stored.
 */
export const AddShoppingListItemRequestSchema = z
  .object({
    food_id: z.string().uuid(),
    source: z.string().min(1).max(64).default("manual"),
  })
  .strict();

export type AddShoppingListItemRequest = z.infer<
  typeof AddShoppingListItemRequestSchema
>;

/** The stored row, echoed for optimistic UI. `source` is nullable in the DB. */
export type AddShoppingListItemResponse = {
  food_id: string;
  source: string | null;
};
