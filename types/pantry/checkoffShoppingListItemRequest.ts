import { z } from "zod";

import { StockStateSchema } from "./stockState";

/**
 * Input for `checkoffShoppingListItemAction` — "I have it again": writes
 * the pantry row and clears the list row in one RPC. Same mode rules as
 * the upsert (decision A default applies).
 */
export const CheckoffShoppingListItemRequestSchema = z
  .object({
    food_id: z.string().uuid(),
    amount: z.number().nonnegative().nullable().optional(),
    unit: z.string().min(1).max(32).nullable().optional(),
    stock_state: StockStateSchema.nullable().optional(),
  })
  .strict();

export type CheckoffShoppingListItemRequest = z.infer<
  typeof CheckoffShoppingListItemRequestSchema
>;

/** The new doorbell version — checkoff moves the pantry. */
export type CheckoffShoppingListItemResponse = {
  version: number;
};
