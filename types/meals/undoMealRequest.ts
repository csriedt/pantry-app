import { z } from "zod";

/** Input for `undoMealAction` — the receipt's undo, by meal id. */
export const UndoMealRequestSchema = z
  .object({
    meal_id: z.string().uuid(),
  })
  .strict();

export type UndoMealRequest = z.infer<typeof UndoMealRequestSchema>;

/** The current doorbell version — unchanged when there was nothing to undo. */
export type UndoMealResponse = {
  version: number;
};
