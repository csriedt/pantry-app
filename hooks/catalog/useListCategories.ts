import { listCategoriesAction } from "@/actions/catalog/listCategoriesAction";
import { ListCategoriesPayload } from "@/types/catalog/listCategoriesResponse";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { categoriesKey } from "./catalogQueryKeys";

/** Every category, ordered for display. Dispatched with `{ params: {} }`. */
export const useListCategories = () => {
  const { query, action } = useGenericServerQueryAction<
    Record<string, never>,
    ListCategoriesPayload
  >(() => categoriesKey(), listCategoriesAction);

  return [query, action] as const;
};
