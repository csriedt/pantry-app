"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Client-side React Query provider for the app. One QueryClient per browser
 * session; the service-flow hooks own keys and invalidation.
 *
 * `refetchOnWindowFocus` is off so the showcase stays deterministic — the
 * sandbox exposes explicit "doorbell" buttons instead.
 */
const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
