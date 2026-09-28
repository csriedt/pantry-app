import { z } from "zod";

/**
 * The three pet lifecycle states the Pet Store API accepts on
 * `findByStatus`. Defined as a zod enum so it doubles as the runtime
 * validator at the service-flow boundary — `PetStatus` is the inferred
 * union type and stays in sync with the schema automatically.
 */
export const PetStatusSchema = z.enum(["available", "pending", "sold"]);

export type PetStatus = z.infer<typeof PetStatusSchema>;
