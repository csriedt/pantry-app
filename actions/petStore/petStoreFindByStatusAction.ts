"use server";

import { createPetStoreUnauthorizedClient } from "@/services/petStore/petStoreUnauthorizedClient";
import { PetStatus, PetStatusSchema } from "@/types/petStore/petStatus";
import { PetStoreFindByStatusListPayload } from "@/types/petStore/petStoreFindByStatusListPayload";
import { PetStoreFindByStatusListResponse } from "@/types/petStore/petStoreFindByStatusListResponse";
import { GenericError } from "@/types/service/genericError";
import { formatGenericError } from "@/lib/service/formatGenericError";
import { getMissingEnvPayload } from "@/lib/service/getMissingEnvPayload";
import { validateInput } from "@/lib/service/validateInput";

export async function petStoreFindByStatusAction(
  status: PetStatus
): Promise<PetStoreFindByStatusListPayload> {
  const validation = validateInput(PetStatusSchema, status);
  if (!validation.success) return { error: validation.error };

  const env = "NEXT_PUBLIC_PET_STORE_FIND_BY_STATUS_ENDPOINT";

  if (!process.env.NEXT_PUBLIC_PET_STORE_FIND_BY_STATUS_ENDPOINT) {
    return getMissingEnvPayload(env);
  }

  let payload: PetStoreFindByStatusListPayload | undefined = undefined;
  let error: GenericError | undefined = undefined;

  try {
    // Fresh per-request client (see petStoreUnauthorizedClient.ts).
    const petStoreUnauthorizedClient = createPetStoreUnauthorizedClient();
    const response =
      await petStoreUnauthorizedClient.get<PetStoreFindByStatusListResponse>(
        process.env.NEXT_PUBLIC_PET_STORE_FIND_BY_STATUS_ENDPOINT,
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
