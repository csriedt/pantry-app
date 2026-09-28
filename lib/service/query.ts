import { Query } from "@tanstack/react-query";

import { ExtendedApiError } from "@/types/service/errors";

/**
 * Controlled refetch logic to manage dynamic polling behavior
 * @param query The query used to determine refetching logic
 * @param refetchInterval Optional interval to refetch at, by default `false` (no refetch)
 * @param onStopRefetching Optional callback when refetching stops by whatever means caused the halt
 * @param maxAttempts Optional maximum number of refetching attempts to allow, if not specified is infinite
 * @param minAttempts Optional minimum number of refetching attempts to require, if not specified is 0 (will immediately stop after data is received). The greater of `maxAttempts` and `minAttempts` is used to determine exhaustive stopping condition.
 * @returns A number representing the refetch interval in **milliseconds** (nominal polling), or a `false` flag to stop refetching
 * @example
 * // Poll every 2 seconds until data is received or max 10 attempts
 * action({
 *   params: {}, // Not specified for example
 *   options: {
 *     refetchInterval: (query) => stoppableRefetchInterval(
 *       query,
 *       2000,
 *       (data, attempts) => console.log(`Stopped after ${attempts} attempts`),
 *       10,
 *       0,
 *     ),
 *   },
 * });
 *
 * // Simple polling every 1 second with defaults
 * action({
 *   params: {}, // Not specified for example
 *   options: {
 *     refetchInterval: (query) => stoppableRefetchInterval(query, 1000),
 *   },
 * });
 */
export const stoppableRefetchInterval = <T>(
  query: Query<T | null, ExtendedApiError, T | null, readonly unknown[]>,
  refetchInterval: number | false = false,
  onStopRefetching:
    | ((data: T | null | undefined, attempts: number) => void)
    | undefined = undefined,
  maxAttempts: number | undefined = undefined,
  minAttempts: number | undefined = undefined
) => {
  const data = query.state.data;
  const attempts = query.state.dataUpdateCount || 0;

  if (
    (data && attempts >= (minAttempts ?? 0)) ||
    query.state.error ||
    attempts >=
      Math.max(maxAttempts ?? Number.POSITIVE_INFINITY, minAttempts ?? 0)
  ) {
    onStopRefetching?.(data, attempts);
    return false;
  }

  return refetchInterval;
};
