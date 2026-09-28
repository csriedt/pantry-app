"use server";

import { createPetStoreUnauthorizedClient } from "@/services/petStore/petStoreUnauthorizedClient";
import { CreatePetPayload } from "@/types/petStore/createPetPayload";
import {
  CreatePetRequest,
  CreatePetRequestSchema,
} from "@/types/petStore/createPetRequest";
import { CreatePetResponse } from "@/types/petStore/createPetResponse";
import { GenericError } from "@/types/service/genericError";
import { formatGenericError } from "@/utils/service/formatGenericError";
import { getMissingEnvPayload } from "@/utils/service/getMissingEnvPayload";
import { validateInput } from "@/utils/service/validateInput";

/**
 * Server action to create a new pet in the Pet Store API.
 *
 * Input is validated against {@link CreatePetRequestSchema} at the
 * boundary — strict (unknown keys rejected) and field-level. Validation
 * failures return a `code: 'validation'` payload with per-issue details
 * the client can render against its form.
 */
export async function createPetAction(
  petData: CreatePetRequest
): Promise<CreatePetPayload> {
  const env = "NEXT_PUBLIC_PET_STORE_CREATE_ENDPOINT";

  if (!process.env.NEXT_PUBLIC_PET_STORE_CREATE_ENDPOINT) {
    return getMissingEnvPayload(env);
  }

  const validation = validateInput(CreatePetRequestSchema, petData);
  if (!validation.success) return { error: validation.error };

  let payload: CreatePetPayload | undefined = undefined;
  let error: GenericError | undefined = undefined;

  try {
    const petStoreUnauthorizedClient = createPetStoreUnauthorizedClient();
    const response = await petStoreUnauthorizedClient.post<CreatePetResponse>(
      process.env.NEXT_PUBLIC_PET_STORE_CREATE_ENDPOINT,
      validation.data
    );
    payload = {
      data: response.data,
    };
  } catch (ex) {
    error = formatGenericError(ex);
  }
  return payload ?? { error };
}
