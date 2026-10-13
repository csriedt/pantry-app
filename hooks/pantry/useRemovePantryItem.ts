import { removePantryItemAction } from "@/actions/pantry/removePantryItemAction";
import { RemovePantryItemPayload } from "@/types/pantry/removePantryItemPayload";
import { RemovePantryItemRequest } from "@/types/pantry/removePantryItemRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { pantryRoot } from "./pantryQueryKeys";

export const useRemovePantryItem = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    RemovePantryItemRequest,
    RemovePantryItemPayload
  >(["pantry", "remove"], [pantryRoot(userId)], removePantryItemAction);

  return [mutate, mutateAsync, isPending] as const;
};
