/**
 * Internal hook to abstract mutation logic using React Query's `useMutation`.
 *
 * This hook is intended for internal use only and should be used exclusively by other hooks
 * to encapsulate mutation functionality. It provides a standardized way to perform mutations
 * and automatically invalidates specified queries upon successful mutation.
 *
 * Per-call callbacks are supported out of the box via React Query's `mutate` signature.
 * Pass `{ onSuccess, onError, onSettled }` as the second argument when invoking the
 * returned `mutate` or `mutateAsync`:
 *
 * ```tsx
 * const [createPet] = useCreatePet();
 * createPet(input, {
 *   onSuccess: (data) => ...,
 *   onError: (error) => ...,
 *   onSettled: (data, error) => ...,
 * });
 * ```
 *
 * The hook-level `onSuccess` is reserved for query invalidation and always fires
 * first; consumer callbacks run after invalidation is queued.
 *
 * ## Callback lifetimes (pinned to React Query 5.104.0)
 *
 * Hook-level callbacks live on the Mutation and run inside `Mutation.execute()`,
 * so invalidation and the default error toast fire even if the component
 * unmounts before the mutation settles. Per-call callbacks passed to
 * `mutate(vars, callbacks)` are observer-gated and do NOT fire after unmount.
 *
 * ## Toast policy
 *
 * Error toasts are default-on and suppressible via `{ error: false }`; success
 * toasts are opt-in. Unlike query refreshes, repeated identical mutation
 * failures are NOT deduped — each dispatch is a deliberate user action and
 * deserves its own feedback.
 *
 * ## Invalidation
 *
 * `invalidationKeys` is an array of query-key prefixes — each prefix is passed to
 * `queryClient.invalidateQueries({ queryKey })`, which matches every cached entry
 * whose key starts with that prefix. Two shapes are supported:
 *
 * 1. **Static** — `readonly QueryKey[]`. All prefixes are invalidated on every
 *    successful mutation. Pass `[]` (empty outer array) or a single-element
 *    `[[...]]` for the common cases.
 * 2. **Dynamic** — `(data: TData) => readonly QueryKey[]`. Called after the mutation
 *    resolves; the returned prefixes are invalidated. Use this when a prefix
 *    depends on the response — e.g. invalidating `['leads', 'detail', leadId]`
 *    only when the mutation touched a lead.
 *
 * Individual keys of length 0 are ignored (an empty prefix matches every cached
 * entry and would flush the whole cache — treated as a no-op instead).
 *
 * @template TVariables - The parameters to be passed to the mutation function.
 * @template TData - The return type of the mutation function.
 *
 * @param mutationKeyPrefix - (required) An array of strings used as the mutation key for React Query.
 * @param invalidationKeys - (required) The prefixes to invalidate on success — static array or a function of the response.
 * @param mutateFn - (required) The asynchronous function that performs the mutation and returns a promise of the result.
 *
 * @returns An object containing the `mutate` result from `useMutation`, which can be used to trigger the mutation.
 *
 * @internal
 */
import { toast } from "@/lib/toast";
import { ExtendedApiError } from "@/types/service/extendedApiError";
import { GenericErrorPayload } from "@/types/service/genericErrorPayload";
import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * A single query-key prefix. React Query's queryKey supports any serialisable
 * value; the service-flow layer sticks to primitives (with `null` explicitly
 * allowed) so keys stay comparable and easy to log. `null` shows up in keys
 * whenever a slot is "known unset" — e.g. the client-side org-id slot before
 * the Clerk session has an active org, per CLAUDE.md "Identity boundaries".
 */
type InvalidationKey = readonly (string | number | boolean | null)[];

/**
 * Either a fixed set of prefixes to invalidate, or a function that derives them
 * from the mutation response. The dynamic form is what lets a caller invalidate
 * a related entity (e.g. `['leads', 'detail', leadId]`) whose id only exists on
 * the response, without dropping down to raw `useMutation`.
 */
type InvalidationSpec<TData> =
  | readonly InvalidationKey[]
  | ((data: TData) => readonly InvalidationKey[]);

type ToastMessages = {
  /** Title shown in the success toast. Omit to suppress. */
  success?: string;
  /**
   * Error toast title. Omit for a generic default ("Something went wrong").
   * Pass `false` to suppress entirely — for background/system mutations
   * where a toast would be noise.
   */
  error?: string | false;
};

export const useGenericServerMutateAction = <
  TVariables = unknown,
  TData = unknown,
>(
  mutationKeyPrefix: string[],
  invalidationKeys: InvalidationSpec<TData>,
  mutateFn: (variables: TVariables) => Promise<TData>,
  toastMessages?: ToastMessages
) => {
  const queryClient = useQueryClient();

  const mutate: UseMutationResult<TData, ExtendedApiError, TVariables> =
    useMutation<TData, ExtendedApiError, TVariables>({
      mutationKey: mutationKeyPrefix,
      mutationFn: async (variables: TVariables): Promise<TData> => {
        const result = await mutateFn(variables);

        // Unwrap a GenericErrorPayload: throw on error so React Query treats it
        // as a failure; otherwise strip the (absent) error key and return the
        // rest as TData.
        if (result && typeof result === "object" && "error" in result) {
          const payload = result as unknown as GenericErrorPayload;
          if (payload.error) {
            throw ExtendedApiError.fromGenericError(payload.error);
          }
          const { error, ...cleanResult } = payload as {
            error?: unknown;
            [key: string]: unknown;
          };
          return cleanResult as TData;
        }

        return result;
      },
      onSuccess: async data => {
        const keys =
          typeof invalidationKeys === "function"
            ? invalidationKeys(data)
            : invalidationKeys;
        for (const key of keys) {
          // An empty prefix matches every query key, so React Query would
          // invalidate the entire cache. Treat individual empty entries as
          // no-ops rather than surprises.
          if (key.length === 0) continue;
          await queryClient.invalidateQueries({ queryKey: key });
        }
        if (toastMessages?.success) {
          toast.success(toastMessages.success);
        }
      },
      onError: (error: ExtendedApiError) => {
        if (toastMessages?.error !== false) {
          toast.error(toastMessages?.error ?? "Something went wrong", error.message);
        }
      },
    });

  return {
    mutate: mutate.mutate,
    mutateAsync: mutate.mutateAsync,
    isPending: mutate.isPending,
  };
};
