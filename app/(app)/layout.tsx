import type { ReactNode } from "react";

import { AppNav } from "./app-nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <main className="flex-1">{children}</main>
      <div className="sticky bottom-0 z-40">
        <AppNav />
      </div>
    </div>
  );
}
