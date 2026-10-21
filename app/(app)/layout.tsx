import { Suspense, type ReactNode } from "react";

import { SessionUserIdProvider } from "@/components/providers/session-user-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/services/supabase/session";

import { AppNav } from "./app-nav";

/**
 * Resolves the session once and hands the id down. A child component, not an
 * `await` in the layout body: the boundary must stream the nav around it.
 */
async function SessionUser({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  return (
    <SessionUserIdProvider userId={user?.id ?? null}>
      {children}
    </SessionUserIdProvider>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <main className="flex-1">
        <Suspense
          fallback={
            <div className="px-5 pt-6">
              <Skeleton className="h-6 w-24" />
            </div>
          }
        >
          <SessionUser>{children}</SessionUser>
        </Suspense>
      </main>
      <div className="sticky bottom-0 z-40">
        <AppNav />
      </div>
    </div>
  );
}
