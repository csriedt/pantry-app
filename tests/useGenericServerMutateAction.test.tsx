// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGenericServerMutateAction } from "@/hooks/service/useGenericServerMutateAction";
import { toast } from "@/lib/toast";
import type { ErrorCode } from "@/types/service/errorCode";
import { ExtendedApiError } from "@/types/service/extendedApiError";

import { createDeferred } from "./helpers/deferred";
import { flushAsync, renderHookWithClient } from "./helpers/queryClient";

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

type Pet = { id: number; name: string };
type TestPayload = { data: Pet };
type TestErrorPayload = {
  error: { message: string; code: ErrorCode; statusCode: number };
};

const payloadError: TestErrorPayload["error"] = {
  message: "Pet store rejected the request.",
  code: "validation",
  statusCode: 422,
};

const mutationKey = ["pets"];

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Characterization suite for `useGenericServerMutateAction` — pins the
 * behaviour of the installed React Query version (5.104.0). Callback-vs-
 * unmount semantics deliberately pin RQ internals (plan §4 D2, §9.1); a
 * failure here means an RQ upgrade changed the contract, not that the test
 * is wrong.
 */
describe("useGenericServerMutateAction (characterization)", () => {
  describe("success", () => {
    it("resolves mutateAsync with the unwrapped data and no error key", async () => {
      const mutateFn = vi.fn(
        async (variables: { name: string }): Promise<TestPayload> => ({
          data: { id: 1, name: variables.name },
        })
      );

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<{ name: string }, TestPayload>(
          mutationKey,
          [],
          mutateFn
        )
      );

      let output: TestPayload | undefined;
      await act(async () => {
        output = await result.current.mutateAsync({ name: "Rex" });
      });

      expect(mutateFn).toHaveBeenCalledWith({ name: "Rex" });
      expect(output).toEqual({ data: { id: 1, name: "Rex" } });
      expect(output).not.toHaveProperty("error");
    });
  });

  describe("payload error", () => {
    it("rejects mutateAsync with ExtendedApiError carrying the normalized payload error", async () => {
      const mutateFn = vi.fn(
        async (): Promise<TestErrorPayload> => ({ error: payloadError })
      );

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<undefined, TestErrorPayload>(
          mutationKey,
          [],
          mutateFn
        )
      );

      let caught: unknown;
      await act(async () => {
        caught = await result.current
          .mutateAsync(undefined)
          .catch(error => error);
      });

      expect(caught).toBeInstanceOf(ExtendedApiError);
      const apiError = caught as ExtendedApiError;
      expect(apiError.genericError).toEqual(payloadError);
      expect(apiError.message).toBe(payloadError.message);
      expect(apiError.statusCode).toBe(payloadError.statusCode);
    });

    it("does not throw synchronously when mutate hits a payload error", async () => {
      const mutateFn = vi.fn(
        async (): Promise<TestErrorPayload> => ({ error: payloadError })
      );

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<undefined, TestErrorPayload>(
          mutationKey,
          [],
          mutateFn
        )
      );

      expect(() => result.current.mutate(undefined)).not.toThrow();
      await flushAsync();

      expect(result.current.isPending).toBe(false);
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidation", () => {
    it("invalidates every static prefix", async () => {
      const mutateFn = vi.fn(
        async (variables: number): Promise<TestPayload> => ({
          data: { id: variables, name: "Rex" },
        })
      );

      const { result, client } = renderHookWithClient(() =>
        useGenericServerMutateAction<number, TestPayload>(
          mutationKey,
          [
            ["pets", "list"],
            ["owners", 1],
          ],
          mutateFn
        )
      );
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");

      await act(async () => {
        await result.current.mutateAsync(7);
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(2);
      expect(invalidateSpy).toHaveBeenNthCalledWith(1, {
        queryKey: ["pets", "list"],
      });
      expect(invalidateSpy).toHaveBeenNthCalledWith(2, {
        queryKey: ["owners", 1],
      });
    });

    it("calls a dynamic invalidation function with the unwrapped response and invalidates its prefixes", async () => {
      const mutateFn = vi.fn(
        async (variables: number): Promise<TestPayload> => ({
          data: { id: variables, name: "Rex" },
        })
      );
      const invalidationKeys = vi.fn(
        (response: TestPayload) =>
          [["pets", "detail", response.data.id]] as const
      );

      const { result, client } = renderHookWithClient(() =>
        useGenericServerMutateAction<number, TestPayload>(
          mutationKey,
          invalidationKeys,
          mutateFn
        )
      );
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");

      await act(async () => {
        await result.current.mutateAsync(7);
      });

      expect(invalidationKeys).toHaveBeenCalledWith({
        data: { id: 7, name: "Rex" },
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["pets", "detail", 7],
      });
    });

    it("skips empty prefix entries instead of flushing the whole cache", async () => {
      const mutateFn = vi.fn(
        async (): Promise<TestPayload> => ({ data: { id: 1, name: "Rex" } })
      );

      const { result, client } = renderHookWithClient(() =>
        useGenericServerMutateAction<void, TestPayload>(
          mutationKey,
          [[], ["pets"]],
          mutateFn
        )
      );
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");

      await act(async () => {
        await result.current.mutateAsync(undefined);
      });

      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["pets"] });
    });
  });

  describe("toasts", () => {
    it("does not call toast.success when no success message is configured", async () => {
      const mutateFn = vi.fn(
        async (): Promise<TestPayload> => ({ data: { id: 1, name: "Rex" } })
      );

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<void, TestPayload>(
          mutationKey,
          [],
          mutateFn
        )
      );

      await act(async () => {
        await result.current.mutateAsync(undefined);
      });

      expect(toast.success).not.toHaveBeenCalled();
    });

    it("calls toast.success with the configured message", async () => {
      const mutateFn = vi.fn(
        async (): Promise<TestPayload> => ({ data: { id: 1, name: "Rex" } })
      );

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<void, TestPayload>(
          mutationKey,
          [],
          mutateFn,
          { success: "Pet created" }
        )
      );

      await act(async () => {
        await result.current.mutateAsync(undefined);
      });

      expect(toast.success).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith("Pet created");
    });

    it("calls toast.error with the default title on failure", async () => {
      const mutateFn = vi.fn(
        async (): Promise<TestErrorPayload> => ({ error: payloadError })
      );

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<undefined, TestErrorPayload>(
          mutationKey,
          [],
          mutateFn
        )
      );

      await act(async () => {
        await result.current.mutateAsync(undefined).catch(() => {});
      });

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(
        "Something went wrong",
        payloadError.message
      );
    });

    it("suppresses the error toast when error is false", async () => {
      const mutateFn = vi.fn(
        async (): Promise<TestErrorPayload> => ({ error: payloadError })
      );

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<undefined, TestErrorPayload>(
          mutationKey,
          [],
          mutateFn,
          { error: false }
        )
      );

      await act(async () => {
        await result.current.mutateAsync(undefined).catch(() => {});
      });

      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe("per-call callbacks", () => {
    it("fires per-call onSuccess and onSettled while mounted", async () => {
      const mutateFn = vi.fn(
        async (variables: number): Promise<TestPayload> => ({
          data: { id: variables, name: "Rex" },
        })
      );
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<number, TestPayload>(
          mutationKey,
          [],
          mutateFn
        )
      );

      await act(async () => {
        result.current.mutate(7, { onSuccess, onError, onSettled });
      });
      await flushAsync();

      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess.mock.calls[0]?.[0]).toEqual({
        data: { id: 7, name: "Rex" },
      });
      expect(onSettled.mock.calls[0]?.[0]).toEqual({
        data: { id: 7, name: "Rex" },
      });
      expect(onSettled.mock.calls[0]?.[1]).toBeNull();
    });

    it("fires per-call onError and onSettled while mounted", async () => {
      const mutateFn = vi.fn(
        async (): Promise<TestErrorPayload> => ({ error: payloadError })
      );
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();

      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<undefined, TestErrorPayload>(
          mutationKey,
          [],
          mutateFn
        )
      );

      await act(async () => {
        result.current.mutate(undefined, { onSuccess, onError, onSettled });
      });
      await flushAsync();

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(ExtendedApiError);
      expect(onSettled.mock.calls[0]?.[0]).toBeUndefined();
      expect(onSettled.mock.calls[0]?.[1]).toBeInstanceOf(ExtendedApiError);
    });
  });

  describe("unmount behaviour (pinned RQ 5.104.0, plan §4 D2 / §9.1)", () => {
    it("fires hook-level onError and the toast after unmount when the deferred mutation later fails", async () => {
      const deferred = createDeferred<TestErrorPayload>();
      const mutateFn = vi.fn(() => deferred.promise);

      const { result, unmount } = renderHookWithClient(() =>
        useGenericServerMutateAction<void, TestErrorPayload>(
          mutationKey,
          [],
          mutateFn,
          { error: "Could not save the pet" }
        )
      );

      let pending: Promise<TestErrorPayload> | undefined;
      await act(async () => {
        pending = result.current.mutateAsync(undefined);
      });
      // The rejection lands after unmount; keep it handled.
      pending?.catch(() => {});

      unmount();

      await act(async () => {
        deferred.resolve({ error: payloadError });
      });
      await flushAsync();

      // Hook-level callbacks run inside Mutation.execute(), independent of
      // observers, so the toast still lands after the component is gone.
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(
        "Could not save the pet",
        payloadError.message
      );
    });

    it("does not fire per-call callbacks after unmount", async () => {
      const deferred = createDeferred<TestPayload>();
      const mutateFn = vi.fn(() => deferred.promise);
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();

      const { result, client, unmount } = renderHookWithClient(() =>
        useGenericServerMutateAction<void, TestPayload>(
          mutationKey,
          [["pets"]],
          mutateFn
        )
      );
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");

      await act(async () => {
        result.current.mutate(undefined, { onSuccess, onError, onSettled });
      });

      unmount();

      await act(async () => {
        deferred.resolve({ data: { id: 1, name: "Rex" } });
      });
      await flushAsync();

      // The mutation did settle while unmounted — the hook-level success path
      // still ran — but per-call callbacks are gated on the observer still
      // having listeners.
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onSettled).not.toHaveBeenCalled();
    });
  });

  describe("isPending", () => {
    it("is true while the deferred mutation is in flight and false after it settles", async () => {
      const deferred = createDeferred<TestPayload>();
      const { result } = renderHookWithClient(() =>
        useGenericServerMutateAction<void, TestPayload>(mutationKey, [], () =>
          deferred.promise
        )
      );

      expect(result.current.isPending).toBe(false);

      await act(async () => {
        result.current.mutate(undefined);
      });
      await flushAsync();
      expect(result.current.isPending).toBe(true);

      await act(async () => {
        deferred.resolve({ data: { id: 1, name: "Rex" } });
      });
      await flushAsync();
      expect(result.current.isPending).toBe(false);
    });
  });
});

// Contract decision: mutations are user-initiated, so every failed dispatch
// gets its own toast — unlike query background refreshes, which dedupe per
// failure episode. Two deliberate attempts failing identically produce two
// toasts.
describe("useGenericServerMutateAction toast policy", () => {
  it("toasts on every failed dispatch (no episode dedup for user-initiated actions)", async () => {
    const mutateFn = vi.fn(
      async (): Promise<TestErrorPayload> => ({ error: payloadError })
    );

    const { result } = renderHookWithClient(() =>
      useGenericServerMutateAction<undefined, TestErrorPayload>(
        mutationKey,
        [],
        mutateFn
      )
    );

    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => {});
    });
    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => {});
    });

    expect(toast.error).toHaveBeenCalledTimes(2);
  });
});
