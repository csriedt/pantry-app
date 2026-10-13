import { z } from "zod";

/**
 * Input for `requestAccountDeletionAction`. The type-to-confirm is the
 * screen's job; the action records the request. The grace period is a
 * fixed constant here (7 days) so the client and the server agree.
 */
export const DELETION_GRACE_DAYS = 7;

export const RequestAccountDeletionResponseSchema = z.object({
  execute_after: z.string(),
});

export type RequestAccountDeletionResponse = z.infer<
  typeof RequestAccountDeletionResponseSchema
>;
