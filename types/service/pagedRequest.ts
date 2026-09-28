import { z } from "zod";

/**
 * Base request shape for paged endpoints. Domain-specific list
 * requests extend this via `.extend({ ... }).strict()` — see
 * `types/actions/listActionsRequest.ts` for the extended form and
 * `types/offers/listOffersRequest.ts` for the plain form.
 *
 * Defaults: page 1, pageSize 20. `pageSize` capped at 100 so a
 * caller can't pull a whole table down accidentally.
 *
 * NB: this schema is NOT `.strict()` on purpose — strict shapes
 * can't be extended without losing the unknown-key rejection.
 * Consumers apply `.strict()` after any `.extend()` so unknown
 * keys still fail at the boundary.
 */
export const PagedRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type PagedRequest = z.infer<typeof PagedRequestSchema>;
