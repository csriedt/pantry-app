"use server";

import { createPetStoreUnauthorizedClient } from "@/services/petStore/petStoreUnauthorizedClient";
import { CreatePetPayload } from "@/types/petStore/createPetPayload";
import {
  CreatePetRequest,
  CreatePetRequestSchema,
} from "@/types/petStore/createPetRequest";
import { CreatePetResponse } from "@/types/petStore/createPetResponse";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { validateInput } from "@/lib/service/validation";

/**
 * Default endpoint for the public Swagger Petstore sandbox; override with
 * `NEXT_PUBLIC_PET_STORE_CREATE_ENDPOINT` when pointing at another
 * environment.
 */
const DEFAULT_ENDPOINT = "/pet";

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
  const validation = validateInput(CreatePetRequestSchema, petData);
  if (!validation.success) return { error: validation.error };

  const endpoint =
    process.env.NEXT_PUBLIC_PET_STORE_CREATE_ENDPOINT ?? DEFAULT_ENDPOINT;

  let payload: CreatePetPayload | undefined = undefined;
  let error: GenericError | undefined = undefined;

  try {
    const petStoreUnauthorizedClient = createPetStoreUnauthorizedClient();
    const response = await petStoreUnauthorizedClient.post<CreatePetResponse>(
      endpoint,
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
