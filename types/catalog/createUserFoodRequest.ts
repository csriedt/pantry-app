import { z } from "zod";

import { Food } from "./food";

/**
 * Input for `createUserFoodAction` — create-on-miss: an unmatched
 * quick-add name becomes a private user row. Neutral metadata only; the
 * normalized name is derived here, never taken from the client.
 */
export const CreateUserFoodRequestSchema = z
  .object({
    canonical_name: z.string().min(1).max(255).trim(),
  })
  .strict();

export type CreateUserFoodRequest = z.infer<
  typeof CreateUserFoodRequestSchema
>;

/**
 * The created (or re-used — a unique collision resolves to the existing
 * row, making the action idempotent) food.
 */
export type CreateUserFoodResponse = {
  food: Food;
};
