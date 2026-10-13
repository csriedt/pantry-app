import { addShoppingListItemAction } from "@/actions/pantry/addShoppingListItemAction";
import { AddShoppingListItemPayload } from "@/types/pantry/addShoppingListItemPayload";
import { AddShoppingListItemRequest } from "@/types/pantry/addShoppingListItemRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { pantryRoot } from "./pantryQueryKeys";

export const useAddShoppingListItem = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    AddShoppingListItemRequest,
    AddShoppingListItemPayload
  >(["pantry", "list-add"], [pantryRoot(userId)], addShoppingListItemAction);

  return [mutate, mutateAsync, isPending] as const;
};
