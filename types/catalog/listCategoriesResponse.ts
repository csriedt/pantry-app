import { GenericPayload } from "../service/payloads";
import { Category } from "./category";

/** Every category, ordered for display. */
export type ListCategoriesResponse = {
  categories: Category[];
};

export type ListCategoriesPayload = GenericPayload<ListCategoriesResponse>;
