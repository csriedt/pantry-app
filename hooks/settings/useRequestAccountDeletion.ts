import { requestAccountDeletionAction } from "@/actions/settings/requestAccountDeletionAction";
import { RequestAccountDeletionPayload } from "@/types/settings/requestAccountDeletionPayload";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { settingsRoot } from "./settingsQueryKeys";

/** Type-to-confirm, then this — records the grace window. */
export const useRequestAccountDeletion = (userId: string | null) => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    void,
    RequestAccountDeletionPayload
  >(
    ["settings", "request-deletion"],
    [settingsRoot(userId)],
    requestAccountDeletionAction,
  );

  return [mutate, mutateAsync, isPending] as const;
};
