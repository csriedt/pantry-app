import { commitMealAction } from "@/actions/meals/commitMealAction";
import { CommitMealPayload } from "@/types/meals/commitMealPayload";
import { CommitMealRequest } from "@/types/meals/commitMealRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { mealsRoot } from "./mealsQueryKeys";
import { pantryRoot } from "../pantry/pantryQueryKeys";

/** "Made it". Invalidates the meals and pantry families — the commit moves both. */
export const useCommitMeal = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    CommitMealRequest,
    CommitMealPayload
  >(
    ["meals", "commit"],
    [pantryRoot(userId), mealsRoot(userId)],
    commitMealAction,
  );

  return [mutate, mutateAsync, isPending] as const;
};
