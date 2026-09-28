// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useGenericServerQueryAction } from "@/hooks/service/useGenericServerQueryAction";
import { toast } from "@/lib/toast";
import type { GenericPayload } from "@/types/service/genericPayload";

import { createDeferred } from "./helpers/deferred";
import {
  createTestQueryClient,
  flushAsync,
  renderHookWithClient,
} from "./helpers/queryClient";

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

type TestPayload = GenericPayload<string>;

const keyFor = (value: number) => ["test-things", value] as const;

describe("useGenericServerQueryAction", () => {
  it("dispatches, resolves unwrapped data, and fires onSuccess + onSettled once", async () => {
    const queryFn = vi.fn((value: number) =>
      Promise.resolve<TestPayload>({ data: `value-${value}` })
    );
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    const { result } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    expect(result.current.query.data).toBeUndefined();

    await act(async () => {
      result.current.action({
        params: 1,
        callbacks: { onSuccess, onSettled },
      });
    });
    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result.current.query.data).toEqual({ data: "value-1" });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ data: "value-1" });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith({ data: "value-1" }, null);
  });

  it("surfaces a payload error as ExtendedApiError and toasts once by default", async () => {
    const onError = vi.fn();
    const queryFn = vi.fn(() =>
      Promise.resolve<TestPayload>({
        error: {
          message: "Upstream exploded.",
          code: "http_5xx",
          statusCode: 502,
        },
      })
    );

    const { result } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({ params: 1, callbacks: { onError } });
    });
    await flushAsync();

    expect(result.current.query.error?.message).toBe("Upstream exploded.");
    expect(result.current.query.error?.statusCode).toBe(502);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Something went wrong",
      "Upstream exploded."
    );
  });

  it("suppresses the error toast when toastMessages.error === false", async () => {
    vi.mocked(toast.error).mockClear();
    const queryFn = vi.fn(() =>
      Promise.resolve<TestPayload>({
        error: { message: "Nope.", code: "http_4xx" },
      })
    );

    const { result } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn, {
        error: false,
      })
    );

    await act(async () => {
      result.current.action({ params: 2 });
    });
    await flushAsync();

    expect(result.current.query.error).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("re-fires callbacks on a background invalidation refetch (observation contract)", async () => {
    let call = 0;
    const queryFn = vi.fn(() => {
      call += 1;
      return Promise.resolve<TestPayload>({ data: `value-${call}` });
    });
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    const { result, client } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({
        params: 1,
        callbacks: { onSuccess, onSettled },
      });
    });
    await flushAsync();

    expect(onSuccess).toHaveBeenCalledTimes(1);

    await act(async () => {
      await client.invalidateQueries({ queryKey: keyFor(1) });
    });
    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(result.current.query.data).toEqual({ data: "value-2" });
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenLastCalledWith({ data: "value-2" });
    expect(onSettled).toHaveBeenCalledTimes(2);
  });

  it("reuses the last dispatch's callbacks on a background refresh (frozen at dispatch)", async () => {
    let call = 0;
    const queryFn = vi.fn(() => {
      call += 1;
      return Promise.resolve<TestPayload>({ data: `value-${call}` });
    });
    const firstDispatch = vi.fn();
    const neverPassed = vi.fn();

    const { result, client } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({
        params: 1,
        callbacks: { onSuccess: firstDispatch },
      });
    });
    await flushAsync();

    await act(async () => {
      await client.invalidateQueries({ queryKey: keyFor(1) });
    });
    await flushAsync();

    expect(firstDispatch).toHaveBeenCalledTimes(2);
    expect(neverPassed).not.toHaveBeenCalled();
  });

  it("does not re-fire callbacks when a refetch returns deeply-equal data (structural sharing)", async () => {
    const queryFn = vi.fn(() =>
      Promise.resolve<TestPayload>({ data: "same-value" })
    );
    const onSuccess = vi.fn();

    const { result, client } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({ params: 1, callbacks: { onSuccess } });
    });
    await flushAsync();

    const dataAfterFirst = result.current.query.data;

    await act(async () => {
      await client.invalidateQueries({ queryKey: keyFor(1) });
    });
    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(result.current.query.data).toBe(dataAfterFirst);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("fires one onError after retries are exhausted", async () => {
    const queryFn = vi.fn(() =>
      Promise.resolve<TestPayload>({
        error: { message: "Always down.", code: "http_5xx" },
      })
    );
    const onError = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });

    const { result } = renderHookWithClient(
      () => useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn),
      { client }
    );

    await act(async () => {
      result.current.action({ params: 1, callbacks: { onError } });
    });

    await vi.waitFor(() => {
      expect(result.current.query.isError).toBe(true);
    });
    await flushAsync();

    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("does not toast a query failure when no callbacks are passed (RED-LIST: default toast is gated on callbacks)", async () => {
    const queryFn = vi.fn(() =>
      Promise.resolve<TestPayload>({
        error: { message: "No callbacks here.", code: "http_5xx" },
      })
    );

    const { result } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({ params: 1 });
    });
    await flushAsync();

    expect(result.current.query.isError).toBe(true);
    // Current behaviour: the toast path sits behind `if (!callbacks) return`.
    // Phase 3 decouples the toast from callback presence.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts per failed background refresh when callbacks are passed (RED-LIST: no failure dedup yet)", async () => {
    const queryFn = vi.fn(() =>
      Promise.resolve<TestPayload>({
        error: { message: "Still down.", code: "http_5xx" },
      })
    );
    const onError = vi.fn();

    const { result, client } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({ params: 1, callbacks: { onError } });
    });
    await flushAsync();
    expect(toast.error).toHaveBeenCalledTimes(1);

    await act(async () => {
      await client.invalidateQueries({ queryKey: keyFor(1) });
    });
    await flushAsync();

    // Current behaviour: every failed refresh re-toasts. Phase 3 adds dedup.
    expect(onError).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it("drops the previous dispatch's callbacks when a new dispatch supersedes it", async () => {
    const first = createDeferred<TestPayload>();
    const second = createDeferred<TestPayload>();
    const firstSuccess = vi.fn();
    const secondSuccess = vi.fn();

    const queryFn = vi.fn((value: number) =>
      value === 1 ? first.promise : second.promise
    );

    const { result } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({ params: 1, callbacks: { onSuccess: firstSuccess } });
    });
    await act(async () => {
      result.current.action({
        params: 2,
        callbacks: { onSuccess: secondSuccess },
      });
    });

    await act(async () => {
      first.resolve({ data: "first" });
    });
    await flushAsync();
    expect(firstSuccess).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve({ data: "second" });
    });
    await flushAsync();

    expect(secondSuccess).toHaveBeenCalledTimes(1);
    expect(secondSuccess).toHaveBeenCalledWith({ data: "second" });
    expect(result.current.query.data).toEqual({ data: "second" });
  });

  it("does not fire callbacks if the component unmounts before the fetch settles", async () => {
    vi.mocked(toast.error).mockClear();
    const deferred = createDeferred<TestPayload>();
    const onSuccess = vi.fn();
    const onError = vi.fn();

    const { result, unmount } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, () =>
        deferred.promise
      )
    );

    await act(async () => {
      result.current.action({
        params: 1,
        callbacks: { onSuccess, onError },
      });
    });

    unmount();

    await act(async () => {
      deferred.resolve({ data: "too-late" });
    });
    await flushAsync();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not fire onSuccess for a null result (current contract)", async () => {
    const onSuccess = vi.fn();
    const queryFn = vi.fn(() => Promise.resolve(null as unknown as TestPayload));

    const { result } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({ params: 1, callbacks: { onSuccess } });
    });
    await flushAsync();

    expect(result.current.query.isSuccess).toBe(true);
    expect(result.current.query.data).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("keeps the action identity stable across rerenders and uses the latest queryFn closure", async () => {
    const queryFn = vi.fn((value: number, multiplier: number) =>
      Promise.resolve<TestPayload>({ data: `${value * multiplier}` })
    );

    const { result, rerender } = renderHookWithClient(
      (props: { multiplier: number }) =>
        useGenericServerQueryAction<number, TestPayload>(keyFor, value =>
          queryFn(value, props.multiplier)
        ),
      { initialProps: { multiplier: 1 } }
    );

    const actionBefore = result.current.action;

    rerender({ multiplier: 3 });

    expect(result.current.action).toBe(actionBefore);

    await act(async () => {
      result.current.action({ params: 2 });
    });
    await flushAsync();

    expect(result.current.query.data).toEqual({ data: "6" });
  });

  it("applies options.select to the observed data", async () => {
    const queryFn = vi.fn(() =>
      Promise.resolve<TestPayload>({ data: "lower" })
    );

    const { result } = renderHookWithClient(() =>
      useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn)
    );

    await act(async () => {
      result.current.action({
        params: 1,
        options: {
          select: data =>
            ({ data: data?.data?.toUpperCase() ?? "" }) as TestPayload,
        },
      });
    });
    await flushAsync();

    expect(result.current.query.data).toEqual({ data: "LOWER" });
  });

  it("toasts once per observer on a shared-key refresh (RED-LIST: duplicate toasts)", async () => {
    const queryFn = vi.fn(() =>
      Promise.resolve<TestPayload>({
        error: { message: "Shared failure.", code: "http_5xx" },
      })
    );
    const client = createTestQueryClient();

    const first = renderHookWithClient(
      () => useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn),
      { client }
    );
    const second = renderHookWithClient(
      () => useGenericServerQueryAction<number, TestPayload>(keyFor, queryFn),
      { client }
    );

    await act(async () => {
      first.result.current.action({ params: 1, callbacks: { onError: vi.fn() } });
      second.result.current.action({
        params: 1,
        callbacks: { onError: vi.fn() },
      });
    });
    await flushAsync();

    expect(second.result.current.query.error?.message).toBe("Shared failure.");

    vi.mocked(toast.error).mockClear();

    await act(async () => {
      await client.invalidateQueries({ queryKey: keyFor(1) });
    });
    await flushAsync();

    // One refetch on the shared key, one toast per mounted observer.
    // Current behaviour: both instances toast the same failure.
    expect(toast.error).toHaveBeenCalledTimes(2);
  });
});
