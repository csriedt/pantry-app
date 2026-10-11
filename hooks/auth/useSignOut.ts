import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { signOutAction } from "@/actions/auth/signOutAction";
import { AuthPayload } from "@/types/auth/authPayload";

// No invalidation prefixes: query keys are user-scoped, so a signed-out
// tab's cache is keyed to a user who is no longer signed in and is never
// read again (a reload drops it entirely).
export const useSignOut = () => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    void,
    AuthPayload
  >(["auth", "sign-out"], [], signOutAction, { error: false });

  return [mutate, mutateAsync, isPending] as const;
};
