import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { signUpAction } from "@/actions/auth/signUpAction";
import { AuthPayload } from "@/types/auth/authPayload";
import { SignUpRequest } from "@/types/auth/signUpRequest";

/** Error toast suppressed — the form renders the failure inline. */
export const useSignUp = () => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    SignUpRequest,
    AuthPayload
  >(["auth", "sign-up"], [], signUpAction, { error: false });

  return [mutate, mutateAsync, isPending] as const;
};
