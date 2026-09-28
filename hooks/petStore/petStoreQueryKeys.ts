import { PetStatus } from "@/types/petStore/petStatus";

/**
 * React Query key builders for the pet-store sandbox.
 *
 * The sandbox exists to prove the service-flow pattern end-to-end, so
 * it follows the same key-factory shape as the real domains
 * (`offersQueryKeys.ts` etc). Keys are flat arrays of primitives — a
 * write can invalidate the whole family via `findByStatusRoot()` while
 * a targeted refetch can invalidate a single status via
 * `findByStatusKey(status)`. Structural prefix matching does the rest.
 */

const FIND_BY_STATUS = "find-by-status" as const;

export const findByStatusRoot = () => [FIND_BY_STATUS] as const;

export const findByStatusKey = (status: PetStatus) =>
  [FIND_BY_STATUS, status] as const;
