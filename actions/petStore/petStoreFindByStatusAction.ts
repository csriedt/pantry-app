"use server";

import { createPetStoreUnauthorizedClient } from "@/services/petStore/petStoreUnauthorizedClient";
import { PetStatus, PetStatusSchema } from "@/types/petStore/petStatus";
import { PetStoreFindByStatusListPayload } from "@/types/petStore/petStoreFindByStatusListPayload";
import { PetStoreFindByStatusListResponse } from "@/types/petStore/petStoreFindByStatusListResponse";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/**
 * Default endpoint for the public Swagger Petstore sandbox; override with
 * `NEXT_PUBLIC_PET_STORE_FIND_BY_STATUS_ENDPOINT` when pointing at another
 * environment.
 */
const DEFAULT_ENDPOINT = "/pet/findByStatus";

export async function petStoreFindByStatusAction(
  status: PetStatus
): Promise<PetStoreFindByStatusListPayload> {
  const validation = validateInput(PetStatusSchema, status);
  if (!validation.success) return { error: validation.error };

  const endpoint =
    process.env.NEXT_PUBLIC_PET_STORE_FIND_BY_STATUS_ENDPOINT ??
    DEFAULT_ENDPOINT;

  let payload: PetStoreFindByStatusListPayload | undefined = undefined;
  let error: GenericError | undefined = undefined;

  try {
    // Fresh per-request client (see petStoreUnauthorizedClient.ts).
    const petStoreUnauthorizedClient = createPetStoreUnauthorizedClient();
    const response =
      await petStoreUnauthorizedClient.get<PetStoreFindByStatusListResponse>(
        endpoint,
        {
          params: { status: validation.data },
          errorConfig: {
            // Petstore returns curated, safe-to-display messages on 4xx — opt in.
            passThroughMessage: true,
          },
        }
      );

    payload = {
      data: response.data,
    };
  } catch (ex) {
    error = formatGenericError(ex);
  }
  return payload ?? { error };
}
