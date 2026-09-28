import { forceFailAction } from "@/actions/petStore/forceFailAction";
import { GenericPayload } from "@/types/service/payloads";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";

/**
 * Mutation hook over `forceFailAction`. The action targets a non-existent
 * Pet Store path so an invocation always resolves with an error — useful for
 * exercising the full deny-by-default error contract through the same
 * mutation pipeline real callers use (transport → formatter → payload →
 * `useGenericServerMutateAction` → `ExtendedApiError` → consumer callback).
 *
 * @example
 * const [forceFail, , isFailing] = useForceFail();
 * forceFail(undefined, {
 *   onError: (err) => console.log(err.genericError),
 * });
 */
export const useForceFail = () => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    void,
    GenericPayload<never>
  >(["force-fail"], [], () => forceFailAction());

  return [mutate, mutateAsync, isPending] as const;
};
