import { createUserFoodAction } from "@/actions/catalog/createUserFoodAction";
import { CreateUserFoodPayload } from "@/types/catalog/createUserFoodPayload";
import { CreateUserFoodRequest } from "@/types/catalog/createUserFoodRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { categoriesKey } from "./catalogQueryKeys";

/**
 * Create-on-miss. Invalidates the category family (a new food may change
 * nothing there, but search results are per-query keys, so the quick-add
 * flow re-dispatches its search itself).
 */
export const useCreateUserFood = () => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    CreateUserFoodRequest,
    CreateUserFoodPayload
  >(["catalog", "create-user-food"], [categoriesKey()], createUserFoodAction);

  return [mutate, mutateAsync, isPending] as const;
};
