import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * RTL auto-cleanup only registers when Vitest globals are enabled; they are
 * not, so teardown is explicit here.
 *
 * Note: tests intentionally do NOT wrap hooks in <StrictMode> yet — see
 * docs/service-layer-plan.md (Phase 1 open item). StrictMode parity can be
 * added as a dedicated suite later.
 */
afterEach(() => {
  cleanup();
});
