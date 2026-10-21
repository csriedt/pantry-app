// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  SessionUserIdProvider,
  useSessionUserId,
} from "@/components/providers/session-user-provider";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const wrapperFor = (userId: string | null) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionUserIdProvider userId={userId}>{children}</SessionUserIdProvider>
  );
  return wrapper;
};

/**
 * The provider's three states are load-bearing: a real id scopes the cache,
 * `null` means "signed out / unresolved", and a missing provider is a mistake
 * that must fail loudly rather than sit in a loading branch forever.
 */
describe("useSessionUserId", () => {
  it("returns the id the shell resolved", () => {
    const { result } = renderHook(() => useSessionUserId(), {
      wrapper: wrapperFor(USER_ID),
    });

    expect(result.current).toBe(USER_ID);
  });

  it("returns null when the session resolved to no user", () => {
    const { result } = renderHook(() => useSessionUserId(), {
      wrapper: wrapperFor(null),
    });

    expect(result.current).toBeNull();
  });

  it("throws when a component is rendered outside the shell", () => {
    // React logs the render error; the throw is the assertion.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => renderHook(() => useSessionUserId())).toThrow(
        /outside the app shell/,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
