import { z } from "zod";

import { StockStateSchema } from "./stockState";

/**
 * One held food, exactly as `get_pantry_snapshot` projects it: flat rows
 * with `category_id` as the grouping key (grouping is the client's job).
 * `amount` XOR `stock_state` always — the table enforces it.
 */
export const PantryItemSchema = z.object({
  food_id: z.string().uuid(),
  canonical_name: z.string().min(1),
  category_id: z.string().uuid().nullable(),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
  stock_state: StockStateSchema.nullable(),
  added_at: z.string(),
});

export type PantryItem = z.infer<typeof PantryItemSchema>;

/**
 * Parse one wire row from the RPC's jsonb. The RPC returns `Json`, so the
 * mapper is the parse boundary: the one place the wire shape becomes a
 * domain type. Touch this and nothing else if the envelope changes.
 */
export function mapPantryItemRow(row: unknown): PantryItem {
  return PantryItemSchema.parse(row);
}
