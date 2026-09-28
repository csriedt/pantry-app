import { PetStatus } from "./petStatus";

interface PetStoreFindByStatusResponseCategory {
  id: number;
  name: string;
}

interface PetStoreFindByStatusResponseTag {
  id: number;
  name: string;
}

export interface PetFindByStatusResponse {
  id: number;
  category: PetStoreFindByStatusResponseCategory;
  name: string;
  photoUrls: string[];
  tags: PetStoreFindByStatusResponseTag[];
  status: PetStatus;
}
