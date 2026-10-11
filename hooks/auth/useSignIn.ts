import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { signInAction } from "@/actions/auth/signInAction";
import { AuthPayload } from "@/types/auth/authPayload";
import { SignInRequest } from "@/types/auth/signInRequest";

/** Error toast suppressed — the form renders the failure inline. */
export const useSignIn = () => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    SignInRequest,
    AuthPayload
  >(["auth", "sign-in"], [], signInAction, { error: false });

  return [mutate, mutateAsync, isPending] as const;
};
