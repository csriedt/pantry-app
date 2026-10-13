import { z } from "zod";

import { StockStateSchema } from "./stockState";

/**
 * Input for `upsertPantryItemAction`. Exactly one of `amount` /
 * `stock_state` is the counted / level mode — the table's XOR check
 * rejects a both-set or neither-set row, and the action applies decision
 * A: a call with neither lands as `stock_state: "stocked"` (level mode
 * until the user sets an amount). Unit only rides with a counted amount.
 */
export const UpsertPantryItemRequestSchema = z
  .object({
    food_id: z.string().uuid(),
    amount: z.number().nonnegative().nullable().optional(),
    unit: z.string().min(1).max(32).nullable().optional(),
    stock_state: StockStateSchema.nullable().optional(),
  })
  .strict();

export type UpsertPantryItemRequest = z.infer<
  typeof UpsertPantryItemRequestSchema
>;

/**
 * Applies decision A's default: neither mode supplied becomes
 * `stock_state: "stocked"`. Kept out of the RPC — the function stays
 * strict and the table check stays the guard.
 */
export function withDefaultStockState(
  request: UpsertPantryItemRequest,
): UpsertPantryItemRequest {
  const hasAmount = request.amount !== null && request.amount !== undefined;
  const hasState =
    request.stock_state !== null && request.stock_state !== undefined;
  if (hasAmount || hasState) return request;
  return { ...request, stock_state: "stocked" };
}
