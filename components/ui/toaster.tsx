"use client";

import { useSyncExternalStore } from "react";

import { dismissToast, getToasts, subscribeToToasts } from "@/lib/toast";

/**
 * Renderer for the `lib/toast` store. Mounted once in the root layout; the
 * store is module-scoped, so toasts survive component/route unmounts (the
 * whole point of the seam — background revalidation failures still surface).
 */
export function Toaster() {
  const toasts = useSyncExternalStore(
    subscribeToToasts,
    getToasts,
    getToasts
  );

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map(item => (
        <div
          key={item.id}
          role="status"
          className={`pointer-events-auto rounded-md border p-3 shadow-md ${
            item.variant === "error"
              ? "border-red-300 bg-red-50"
              : "border-green-300 bg-green-50"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{item.title}</p>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              className="text-xs opacity-60 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
          {item.message ? (
            <p className="mt-1 text-xs opacity-80">{item.message}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
