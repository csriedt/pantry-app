import { z } from "zod";

/**
 * Level-mode stock states. The DB column is a loose varchar guarded by a
 * check constraint; the service layer narrows it to this union at the
 * mapper boundary.
 */
export const StockStateSchema = z.enum(["stocked", "short", "out"]);
export type StockState = z.infer<typeof StockStateSchema>;
