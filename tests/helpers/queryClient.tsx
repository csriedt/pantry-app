import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  renderHook,
  type RenderHookOptions,
} from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * A fresh QueryClient per test. Retries are disabled so "error" tests settle
 * on the first failure; the retry-specific tests override this.
 */
export const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });

export const createQueryClientWrapper = (client: QueryClient) => {
  return function QueryClientWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
};

export interface RenderHookWithClientResult<TResult> {
  result: { current: TResult };
  rerender: (props?: unknown) => void;
  unmount: () => void;
  client: QueryClient;
}

export const renderHookWithClient = <TResult, TProps>(
  callback: (props: TProps) => TResult,
  options?: {
    client?: QueryClient;
    initialProps?: TProps;
  }
): RenderHookWithClientResult<TResult> => {
  const client = options?.client ?? createTestQueryClient();
  const hook = renderHook(callback, {
    wrapper: createQueryClientWrapper(client),
    initialProps: options?.initialProps,
  } as RenderHookOptions<TProps>);

  return {
    result: hook.result as { current: TResult },
    rerender: props => hook.rerender(props as TProps),
    unmount: hook.unmount,
    client,
  };
};

/**
 * Let React effects and React Query's `setTimeout(0)` notification batching
 * settle. Prefer this over arbitrary sleeps; it advances one macrotask inside
 * `act`.
 */
export const flushAsync = async (ms = 0): Promise<void> => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
};
