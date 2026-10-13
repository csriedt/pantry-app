import { checkoffShoppingListItemAction } from "@/actions/pantry/checkoffShoppingListItemAction";
import { CheckoffShoppingListItemPayload } from "@/types/pantry/checkoffShoppingListItemPayload";
import { CheckoffShoppingListItemRequest } from "@/types/pantry/checkoffShoppingListItemRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { pantryRoot } from "./pantryQueryKeys";

export const useCheckoffShoppingListItem = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    CheckoffShoppingListItemRequest,
    CheckoffShoppingListItemPayload
  >(["pantry", "checkoff"], [pantryRoot(userId)], checkoffShoppingListItemAction);

  return [mutate, mutateAsync, isPending] as const;
};
