import { upsertPantryItemAction } from "@/actions/pantry/upsertPantryItemAction";
import { UpsertPantryItemPayload } from "@/types/pantry/upsertPantryItemPayload";
import { UpsertPantryItemRequest } from "@/types/pantry/upsertPantryItemRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { pantryRoot } from "./pantryQueryKeys";

export const useUpsertPantryItem = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    UpsertPantryItemRequest,
    UpsertPantryItemPayload
  >(["pantry", "upsert"], [pantryRoot(userId)], upsertPantryItemAction);

  return [mutate, mutateAsync, isPending] as const;
};
