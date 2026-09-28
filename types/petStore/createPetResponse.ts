import { PetStatus } from "./petStatus";

/**
 * Response from creating a new pet in the Pet Store API.
 * Based on Swagger Petstore API specification.
 */
export interface CreatePetResponse {
  id: number;
  name: string;
  category?: {
    id?: number;
    name?: string;
  };
  photoUrls: string[];
  tags?: Array<{
    id?: number;
    name?: string;
  }>;
  status?: PetStatus;
}
