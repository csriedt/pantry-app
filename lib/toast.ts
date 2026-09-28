import "client-only";
import { Toast } from "@base-ui/react/toast";

export type ToastType = "success" | "error" | "warning" | "info";

// Module-level manager — lives outside the React tree. Survives component
// unmounts and can be called from client components, event handlers, or anywhere
// in the browser JS runtime (as long as the React tree hasn't hard-navigated away).
export const toastManager = Toast.createToastManager();

const TIMEOUTS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

type ToastOptions = { timeout?: number };

export const toast = {
  success: (title: string, description?: string, options?: ToastOptions) =>
    toastManager.add({
      title,
      description,
      type: "success",
      timeout: options?.timeout ?? TIMEOUTS.success,
    }),

  error: (title: string, description?: string, options?: ToastOptions) =>
    toastManager.add({
      title,
      description,
      type: "error",
      timeout: options?.timeout ?? TIMEOUTS.error,
      priority: "high",
    }),

  warning: (title: string, description?: string, options?: ToastOptions) =>
    toastManager.add({
      title,
      description,
      type: "warning",
      timeout: options?.timeout ?? TIMEOUTS.warning,
    }),

  info: (title: string, description?: string, options?: ToastOptions) =>
    toastManager.add({
      title,
      description,
      type: "info",
      timeout: options?.timeout ?? TIMEOUTS.info,
    }),
};
