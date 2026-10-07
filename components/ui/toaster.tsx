"use client";

import { useSyncExternalStore } from "react";

import { dismissToast, getToasts, subscribeToToasts } from "@/lib/toast";

/**
 * Renderer for the `lib/toast` store. The store is module-scoped, so a toast
 * fired while a component unmounts still lands on the stack — that is
 * deliberate and load-bearing for background revalidation failures.
 *
 * Design: surface card, strong border, above the nav, `role="status"`,
 * dismissal does not move focus.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, getToasts);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-[108px] z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map(item => (
        <div
          key={item.id}
          role="status"
          className={`pointer-events-auto rounded-control border bg-surface px-4 py-3.5 shadow-toast ${
            item.variant === "error" ? "border-danger/40" : "border-strong"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-small font-semibold ${
                item.variant === "error" ? "text-danger" : "text-ink"
              }`}
            >
              {item.title}
            </p>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              className="text-xs text-muted-foreground hover:text-ink"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
          {item.message ? (
            <p className="mt-1 text-small text-muted-foreground">
              {item.message}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
