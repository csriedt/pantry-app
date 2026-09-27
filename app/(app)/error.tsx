"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

// Route-group error boundary — catches server or client component errors
// thrown anywhere under app/(app)/. Contains blast radius: the AppShell chrome
// (sidebar, topbar) from the root layout still renders normally.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AppError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-foreground text-2xl font-semibold">
        Something went wrong
      </h2>
      <p className="text-muted-foreground max-w-md text-center text-sm">
        Try again — if it keeps happening, refresh the page. If the ref below
        is shown, share it with support.
      </p>
      {error.digest && (
        <p className="text-muted-foreground font-mono text-xs">
          ref: {error.digest}
        </p>
      )}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
