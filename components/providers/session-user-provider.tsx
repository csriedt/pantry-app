"use client";

import { createContext, use, type ReactNode } from "react";

/**
 * The id scopes React Query keys only — identity is resolved server-side.
 * `undefined` = no provider (throws); `null` = no session.
 */
const SessionUserIdContext = createContext<string | null | undefined>(undefined);

export const SessionUserIdProvider = ({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) => (
  <SessionUserIdContext.Provider value={userId}>
    {children}
  </SessionUserIdContext.Provider>
);

export const useSessionUserId = (): string | null => {
  const userId = use(SessionUserIdContext);

  if (userId === undefined) {
    throw new Error(
      "useSessionUserId was called outside the app shell — mount the screen under app/(app)/layout.tsx, or wrap it in SessionUserIdProvider in tests.",
    );
  }

  return userId;
};
