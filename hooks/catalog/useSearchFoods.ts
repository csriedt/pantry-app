import { searchFoodsAction } from "@/actions/catalog/searchFoodsAction";
import { SearchFoodsPayload } from "@/types/catalog/searchFoodsPayload";
import { SearchFoodsRequest } from "@/types/catalog/searchFoodsRequest";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { foodSearchKey } from "./catalogQueryKeys";

/** The quick-add type-ahead. Dispatched with `{ params: { query, limit? } }`. */
export const useSearchFoods = () => {
  const { query, action } = useGenericServerQueryAction<
    SearchFoodsRequest,
    SearchFoodsPayload
  >(
    params => foodSearchKey(params.query, params.limit ?? 8),
    searchFoodsAction,
  );

  return [query, action] as const;
};
