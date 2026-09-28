import { GenericPayload } from "../service/genericPayload";
import { CreatePetResponse } from "./createPetResponse";

/**
 * Payload type for the create pet action.
 */
export type CreatePetPayload = GenericPayload<CreatePetResponse>;
