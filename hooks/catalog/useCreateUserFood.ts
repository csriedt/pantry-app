import { createUserFoodAction } from "@/actions/catalog/createUserFoodAction";
import { CreateUserFoodPayload } from "@/types/catalog/createUserFoodPayload";
import { CreateUserFoodRequest } from "@/types/catalog/createUserFoodRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { foodSearchRoot } from "./catalogQueryKeys";

/**
 * Create-on-miss. Invalidates the food-search family: a new user row
 * belongs in the caller's own type-ahead results, and search is uncached
 * server-side, so this is the React Query side only. The server action
 * itself invalidates nothing — the one cached read that touches `foods`
 * is the global recipe catalog, whose entry a user food cannot reach
 * (no recipe references it).
 */
export const useCreateUserFood = () => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    CreateUserFoodRequest,
    CreateUserFoodPayload
  >(["catalog", "create-user-food"], [foodSearchRoot()], createUserFoodAction);

  return [mutate, mutateAsync, isPending] as const;
};
