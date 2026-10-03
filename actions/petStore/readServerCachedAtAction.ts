"use server";

import { validateInput } from "@/lib/service/validation";
import { PetStatusSchema } from "@/types/petStore/petStatus";
import { GenericPayload } from "@/types/service/payloads";

import { petStoreFindByStatusCachedAction } from "./petStoreFindByStatusCachedAction";

/**
 * Diagnostic read for the sandbox: returns the server cache entry's
 * `cachedAt` without touching React Query. Lets server state and client state
 * be observed independently, so a stale panel can be told apart from a stale
 * cache entry.
 */
export async function readServerCachedAtAction(
  status: string
): Promise<GenericPayload<{ cachedAt: string | null }>> {
  const validation = validateInput(PetStatusSchema, status);
  if (!validation.success) return { error: validation.error };

  const result = await petStoreFindByStatusCachedAction({
    params: validation.data,
  });

  if (result.error) return { error: result.error };
  return { data: { cachedAt: result.cachedAt ?? null } };
}
