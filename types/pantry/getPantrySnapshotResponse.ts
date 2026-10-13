import { z } from "zod";

import { PantryItemSchema } from "./pantryItem";

const DerivedListRowSchema = z.object({
  food_id: z.string().uuid(),
  canonical_name: z.string().min(1),
  amount: z.number().nullable(),
  unit: z.string().nullable(),
  reason: z.enum(["out", "low", "declining"]),
  used_28d: z.number(),
});

const StoredListRowSchema = z.object({
  food_id: z.string().uuid(),
  canonical_name: z.string().min(1),
  source: z.string().nullable(),
});

/**
 * The read envelope: version, items, and the derived shopping list from one
 * statement. A food can appear in both `derived` and `stored` — the client
 * merges by `food_id` (the "added" badge case).
 */
export const GetPantrySnapshotResponseSchema = z.object({
  version: z.number(),
  items: z.array(PantryItemSchema),
  list: z.object({
    derived: z.array(DerivedListRowSchema),
    stored: z.array(StoredListRowSchema),
  }),
});

export type GetPantrySnapshotResponse = z.infer<
  typeof GetPantrySnapshotResponseSchema
>;

export type DerivedListRow = z.infer<typeof DerivedListRowSchema>;
export type StoredListRow = z.infer<typeof StoredListRowSchema>;
