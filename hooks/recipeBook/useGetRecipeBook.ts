import { getRecipeBookAction } from "@/actions/recipeBook/getRecipeBookAction";
import { GetRecipeBookPayload } from "@/types/recipeBook/getRecipeBookPayload";
import { GetRecipeBookRequest } from "@/types/recipeBook/getRecipeBookRequest";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { recipeBookKey } from "./recipeBookQueryKeys";

/** The recipe book projection. Dispatched with `{ params: { view } }`. */
export const useGetRecipeBook = () => {
  const { query, action } = useGenericServerQueryAction<
    GetRecipeBookRequest,
    GetRecipeBookPayload
  >(params => recipeBookKey(params.view), getRecipeBookAction);

  return [query, action] as const;
};
