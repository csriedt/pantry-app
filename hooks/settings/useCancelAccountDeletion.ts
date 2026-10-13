import { cancelAccountDeletionAction } from "@/actions/settings/cancelAccountDeletionAction";
import { CancelAccountDeletionPayload } from "@/types/settings/cancelAccountDeletionPayload";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { settingsRoot } from "./settingsQueryKeys";

/** The grace banner's Cancel. */
export const useCancelAccountDeletion = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    void,
    CancelAccountDeletionPayload
  >(
    ["settings", "cancel-deletion"],
    [settingsRoot(userId)],
    cancelAccountDeletionAction,
  );

  return [mutate, mutateAsync, isPending] as const;
};
