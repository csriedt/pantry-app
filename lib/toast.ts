/**
 * Toast seam for the service-flow layer.
 *
 * The generic hooks must not depend on a concrete toast UI. They call
 * `toast.error` / `toast.success`; this module owns the stack. Swap the
 * internals for sonner / Radix / a custom renderer later without touching a
 * single hook.
 *
 * Model: module-level store, renderer subscribes via `subscribeToToasts`.
 * Because the store is module-scoped (not React state), a toast call that
 * happens while a component is unmounting still lands on the stack — that is
 * deliberate and load-bearing for background revalidation failures.
 */

export type ToastVariant = "error" | "success";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  createdAt: number;
}

export type ToastListener = (toasts: readonly ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();
let sequence = 0;

const emit = (): void => {
  for (const listener of listeners) listener(toasts);
};

const add = (
  variant: ToastVariant,
  title: string,
  message?: string
): string => {
  sequence += 1;
  const item: ToastItem = {
    id: `toast-${Date.now()}-${sequence}`,
    variant,
    title,
    ...(message !== undefined ? { message } : {}),
    createdAt: Date.now(),
  };
  toasts = [...toasts, item];
  emit();
  return item.id;
};

export const toast = {
  error: (title: string, message?: string): string =>
    add("error", title, message),
  success: (title: string, message?: string): string =>
    add("success", title, message),
};

export const dismissToast = (id: string): void => {
  const next = toasts.filter(item => item.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
};

export const clearToasts = (): void => {
  if (toasts.length === 0) return;
  toasts = [];
  emit();
};

export const getToasts = (): readonly ToastItem[] => toasts;

export const subscribeToToasts = (listener: ToastListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
