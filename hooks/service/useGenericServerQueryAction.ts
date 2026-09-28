import { toast } from "@/lib/toast";
import { ExtendedApiError } from "@/types/service/extendedApiError";
import { GenericErrorPayload } from "@/types/service/genericErrorPayload";
import {
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

type QueryCallbacks<TData> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: ExtendedApiError) => void;
  onSettled?: (data: TData | null, error: ExtendedApiError | null) => void;
};

export type ToastMessages = {
  /**
   * Error toast title. Omit for a generic default ("Something went wrong").
   * Pass `false` to suppress entirely — for background/system queries
   * where a toast would be noise.
   */
  error?: string | false;
};

type UseServerQueryActionParams<TParams, TData> = {
  params: TParams;
  // Optional query options with omissions to avoid breaking critical functionality
  // These omitted values are locked by the implementing hook and internal logic in this hook
  options?: Omit<
    UseQueryOptions<TData | null, ExtendedApiError>,
    "queryKey" | "queryFn" | "enabled"
  >;
  // Optional callbacks that fire when the action completes
  callbacks?: QueryCallbacks<TData>;
};

const unwrapPayload = <TData>(result: unknown): TData | null => {
  if (result && typeof result === "object" && "error" in result) {
    const payload = result as GenericErrorPayload;
    if (payload.error) {
      throw ExtendedApiError.fromGenericError(payload.error);
    }
    const { error, ...cleanResult } = payload as {
      error?: unknown;
      [key: string]: unknown;
    };
    return cleanResult as TData;
  }
  return result as TData;
};

/**
 * Shared placeholder key for hooks that have not yet been dispatched.
 * Every idle instance sits under this key with `enabled: false`, so no
 * fetch ever runs against it — sharing the slot is invisible in
 * practice and keeps the API surface minimal (no caller-supplied idle
 * key needed).
 */
const IDLE_QUERY_KEY = ["__useGenericServerQueryAction_idle__"] as const;

/**
 * Internal generic hook for managing server-side queries using React Query.
 *
 * Intended for use only by other hooks, not directly by components.
 *
 * ## Query key contract
 *
 * `getQueryKey(params)` is the single source of truth for the cache key.
 * Return the full, flat key array — the hook does not wrap or append
 * anything. Pair this with a domain key builder (e.g. `offersListKey`)
 * so the builder and the hook produce the same shape by construction:
 *
 * ```ts
 * useGenericServerQueryAction<ListOffersRequest, ListOffersPayload>(
 *   params => offersListKey(orgId ?? null, params.page, params.pageSize),
 *   listOffersAction,
 * );
 * ```
 *
 * Keys should be flat arrays of primitives so React Query's structural
 * prefix matching works for both broad (`[OFFERS, orgId]`) and narrow
 * (`[OFFERS, orgId, "list", page]`) invalidations.
 *
 * The returned `action` has a stable reference across renders, so callers can safely
 * include it in `useEffect` dependency arrays without triggering re-render loops —
 * inline arrow functions passed in by the calling hook do not destabilise it.
 *
 * ## Callback contract (observation-scoped)
 *
 * Callbacks fire on every observed data/error transition for the active key —
 * the dispatch itself, mutation-driven invalidations, focus/reconnect/interval
 * refetches — NOT once per `action()` call. This is deliberate: background
 * revalidation sync is load-bearing for the app, and callbacks are the last
 * mile of that loop.
 *
 * Closures are captured at dispatch and reused by later background refreshes
 * (frozen-at-dispatch). Treat callbacks as declarative handlers: read fresh
 * state from the callback arguments or refs, never from captured mutable state.
 * `onError` fires once per failed refresh; the error toast is deduped per
 * failure episode (same code/message) until a success resets it.
 *
 * A `null` result does not fire `onSuccess` (the observer cannot distinguish
 * it from "no data yet" cheaply); keep payload data non-null.
 *
 * @template TParams - Type of the query parameters.
 * @template TData - Type of the query result data.
 *
 * @param getQueryKey - (required) Function producing the full cache key from params.
 *   Latest closure is used per invocation; reference changes do not destabilise `action`.
 * @param queryFn - (required) Async function that performs the query. The latest
 *   closure is used per invocation; reference changes do not destabilise `action`.
 *
 * @returns `{ query, action }` — React Query state and a stable dispatcher.
 *
 * @internal
 */
export const useGenericServerQueryAction = <TParams = unknown, TData = unknown>(
  getQueryKey: (params: TParams) => readonly unknown[],
  queryFn: (params: TParams) => Promise<TData>,
  toastMessages?: ToastMessages
) => {
  const queryClient = useQueryClient();

  // Refs hold the latest user-supplied callbacks so that `action`'s identity is stable
  // even when callers pass inline arrows. Refs are written in an effect (never in render)
  // and read only in event-handler contexts (`action`).
  const queryFnRef = useRef(queryFn);
  const getQueryKeyRef = useRef(getQueryKey);
  useEffect(() => {
    queryFnRef.current = queryFn;
    getQueryKeyRef.current = getQueryKey;
  });

  // The active query is fully described by state. `action` is the only writer.
  // Storing the precomputed queryKey alongside the request avoids having to recompute
  // it during render (which would require reading `getQueryKeyRef.current`).
  const [activeState, setActiveState] = useState<{
    request: UseServerQueryActionParams<TParams, TData>;
    queryKey: readonly unknown[];
  } | null>(null);

  const request = activeState?.request ?? null;
  const queryKey = activeState?.queryKey ?? IDLE_QUERY_KEY;
  const queryOptions = request?.options ?? {};

  const query = useQuery<TData | null, ExtendedApiError>({
    ...queryOptions,
    queryKey,
    queryFn: async () => {
      if (!request) return null;
      return unwrapPayload<TData>(await queryFn(request.params));
    },
    enabled: request !== null,
  });

  const action = useCallback(
    (queryParams: UseServerQueryActionParams<TParams, TData>) => {
      const nextRequest: UseServerQueryActionParams<TParams, TData> = {
        ...queryParams,
      };
      const nextQueryKey = getQueryKeyRef.current(queryParams.params);

      setActiveState({ request: nextRequest, queryKey: nextQueryKey });

      const liveQueryFn = queryFnRef.current;
      void queryClient
        .prefetchQuery({
          queryKey: nextQueryKey,
          queryFn: async () =>
            unwrapPayload<TData>(await liveQueryFn(nextRequest.params)),
          staleTime: queryParams.options?.staleTime,
        })
        .catch(() => {
          // Errors are surfaced via React Query state; swallow to keep action fire-and-forget.
        });
    },
    [queryClient]
  );

  // Fire user-provided callbacks on genuine state transitions, not on every
  // render where the effect's deps happen to change. A background refetch
  // of this queryKey (e.g. triggered by an unrelated mutation invalidating
  // a shared cache prefix) flips `query.isFetching` to true while
  // `query.data`/`query.error` still hold the previous, stale value —
  // without the reference checks below, that alone would re-run the
  // original onSuccess/onError against data that's about to be replaced.
  //
  // `onSettled` piggybacks on the same dedup: it's not gated on ever having
  // observed `isFetching === true` (a component can mount onto an already-
  // resolved, cached query and never see a fetch happen), it's gated on a
  // new success/error having just landed and the query no longer fetching —
  // `pendingSettle` survives across renders so a resolve-and-stop-fetching
  // that lands in separate render passes still fires exactly once.
  const settleRef = useRef<{
    state: typeof activeState;
    lastData: TData | null;
    lastError: ExtendedApiError | null;
    lastToastedError: string | null;
    pendingSettle: boolean;
  }>({
    state: null,
    lastData: null,
    lastError: null,
    lastToastedError: null,
    pendingSettle: false,
  });

  useEffect(() => {
    if (settleRef.current.state !== activeState) {
      settleRef.current = {
        state: activeState,
        lastData: null,
        lastError: null,
        lastToastedError: null,
        pendingSettle: false,
      };
    }
    const tracking = settleRef.current;
    const callbacks = activeState?.request.callbacks;

    if (
      query.isSuccess &&
      query.data !== null &&
      query.data !== tracking.lastData
    ) {
      tracking.lastData = query.data as TData;
      tracking.pendingSettle = true;
      // A fresh success ends the failure episode: the next identical failure
      // is allowed to toast again.
      tracking.lastToastedError = null;
      callbacks?.onSuccess?.(query.data as TData);
    }

    if (query.isError && query.error && query.error !== tracking.lastError) {
      tracking.lastError = query.error;
      tracking.pendingSettle = true;
      callbacks?.onError?.(query.error);

      // Toast policy: default-on (independent of whether callbacks were
      // passed), suppressible via `toastMessages.error === false`, deduped per
      // failure episode so a repeatedly failing background refresh does not
      // re-toast on every attempt.
      if (toastMessages?.error !== false) {
        const normalized = query.error.genericError;
        const code =
          normalized && typeof normalized === "object" ? normalized.code : "";
        const signature = `${code}|${query.error.statusCode ?? ""}|${query.error.message}`;
        if (tracking.lastToastedError !== signature) {
          tracking.lastToastedError = signature;
          toast.error(
            toastMessages?.error ?? "Something went wrong",
            query.error.message
          );
        }
      }
    }

    if (tracking.pendingSettle && !query.isFetching) {
      tracking.pendingSettle = false;
      callbacks?.onSettled?.(
        (query.data ?? null) as TData | null,
        query.error ?? null
      );
    }
  }, [
    query.isSuccess,
    query.isError,
    query.isFetching,
    query.data,
    query.error,
    activeState,
  ]);

  return { query, action };
};
