/**
 * Stable, enumerated error categories surfaced by the service-flow stack.
 *
 * Codes never include upstream-supplied strings — they're a fixed vocabulary
 * the client can branch on safely (translations, retry policy, telemetry tags).
 * This array is the single runtime source of truth; `ErrorCode` is derived
 * from it and `isErrorCode` guards unknown runtime inputs.
 */
export const ERROR_CODES = [
  "transport", // network failure, DNS, CORS, ECONNREFUSED, etc.
  "timeout", // request exceeded its configured timeout
  "unauthorized", // HTTP 401 / 403
  "not_found", // HTTP 404
  "validation", // HTTP 422 / unprocessable entity
  "http_4xx", // any other 4xx
  "http_5xx", // any 5xx
  "missing_env", // server-side environment misconfiguration
  "missing_param", // caller passed an invalid / empty required parameter
  "unknown", // catch-all — used only when nothing more specific applies
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === "string" &&
  (ERROR_CODES as readonly string[]).includes(value);
