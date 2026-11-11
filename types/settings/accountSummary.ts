import { z } from "zod";

/**
 * The Settings account summary. `chef_budget` is the one placeholder on
 * this surface: the ledger is server-only, and the read (an aggregate RPC
 * or a service-written counter row) lands with the AI work — it is null
 * until then, never fabricated.
 */
export const AccountSummarySchema = z.object({
  email: z.string().email(),
  chef_budget: z
    .object({
      used: z.boolean(),
      resets_at: z.string().nullable(),
    })
    .nullable(),
  deletion_pending: z.boolean(),
  deletion_execute_after: z.string().nullable(),
});

export type AccountSummary = z.infer<typeof AccountSummarySchema>;
