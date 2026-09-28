"use server";

import { createPetStoreUnauthorizedClient } from "@/services/petStore/petStoreUnauthorizedClient";
import { GenericError } from "@/types/service/genericError";
import { GenericPayload } from "@/types/service/genericPayload";
import { formatGenericError } from "@/utils/service/formatGenericError";

/**
 * Intentional-failure server action. Hits an endpoint that does not exist on
 * the Pet Store so the resulting error walks the full transport → formatter →
 * payload path with **no** error-config opt-ins. Used by the example page to
 * verify the deny-by-default contract: only `message` (default), `code`, and
 * `statusCode` should reach the caller — never stacks, response bodies, or
 * arbitrary axios fields.
 */
export async function forceFailAction(): Promise<GenericPayload<never>> {
  let error: GenericError | undefined;
  try {
    const petStoreUnauthorizedClient = createPetStoreUnauthorizedClient();
    await petStoreUnauthorizedClient.get("/this-endpoint-does-not-exist");
  } catch (ex) {
    error = formatGenericError(ex);
  }
  return { error };
}
