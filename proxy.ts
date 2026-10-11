import type { NextRequest } from "next/server";

import { updateSession } from "@/services/supabase/session";

// Next 16 convention: proxy.ts replaces middleware.ts — same location,
// same matcher semantics. Session refresh + deny-by-default gating for
// every route except Next internals, static files, and /api (route
// handlers read the session themselves; none are gated here).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next|api|[^?]*\\.(?:html?|css|js|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
