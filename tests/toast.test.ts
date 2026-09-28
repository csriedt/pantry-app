import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearToasts,
  dismissToast,
  getToasts,
  subscribeToToasts,
  toast,
} from "@/lib/toast";

describe("lib/toast", () => {
  beforeEach(() => {
    clearToasts();
  });

  it("collapses identical live toasts into one entry", () => {
    const firstId = toast.error("Something went wrong", "Boom.");
    const secondId = toast.error("Something went wrong", "Boom.");

    expect(getToasts()).toHaveLength(1);
    expect(secondId).toBe(firstId);
  });

  it("allows an identical toast again once the live one is dismissed", () => {
    const id = toast.error("Something went wrong", "Boom.");
    dismissToast(id);

    toast.error("Something went wrong", "Boom.");
    expect(getToasts()).toHaveLength(1);
  });

  it("treats different messages or variants as distinct", () => {
    toast.error("Title", "One.");
    toast.error("Title", "Two.");
    toast.success("Title", "One.");

    expect(getToasts()).toHaveLength(3);
  });

  it("notifies subscribers on add, dismiss, and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToToasts(listener);

    const id = toast.success("Saved.");
    dismissToast(id);
    toast.success("Saved.");
    clearToasts();

    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
  });

  it("returns a stable snapshot reference until the stack changes", () => {
    toast.success("One.");
    const first = getToasts();
    expect(getToasts()).toBe(first);

    toast.success("Two.");
    expect(getToasts()).not.toBe(first);
  });
});
