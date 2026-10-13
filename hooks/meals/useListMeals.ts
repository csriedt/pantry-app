import { listMealsAction } from "@/actions/meals/listMealsAction";
import { ListMealsPayload } from "@/types/meals/listMealsPayload";
import { ListMealsRequest } from "@/types/meals/listMealsRequest";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { mealsListKey } from "./mealsQueryKeys";

/** Made meals, most recent first. Dispatched with `{ params: { limit? } }`. */
export const useListMeals = (userId: string | null) => {
  const { query, action } = useGenericServerQueryAction<
    Partial<ListMealsRequest>,
    ListMealsPayload
  >(
    params => mealsListKey(userId, params.limit ?? 100),
    listMealsAction,
  );

  return [query, action] as const;
};
