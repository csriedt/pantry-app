import { undoMealAction } from "@/actions/meals/undoMealAction";
import { UndoMealPayload } from "@/types/meals/undoMealPayload";
import { UndoMealRequest } from "@/types/meals/undoMealRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { mealsRoot } from "./mealsQueryKeys";
import { pantryRoot } from "../pantry/pantryQueryKeys";

/** The receipt's undo. Invalidates the meals and pantry families. */
export const useUndoMeal = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    UndoMealRequest,
    UndoMealPayload
  >(
    ["meals", "undo"],
    [pantryRoot(userId), mealsRoot(userId)],
    undoMealAction,
  );

  return [mutate, mutateAsync, isPending] as const;
};
