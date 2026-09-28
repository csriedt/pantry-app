import { ErrorCode } from "./errorCode";

/**
 * The single, safe shape every error in the service-flow stack normalises into.
 *
 * Deny-by-default contract:
 *  - `message` is the caller-controlled `defaultMessage` unless `passThroughMessage`
 *    is explicitly enabled. The raw `error.message` from the source is never
 *    surfaced silently.
 *  - `code` is a stable enum (see {@link ErrorCode}) — never an upstream string.
 *  - `statusCode` is the HTTP status if one could be inferred from the source.
 *  - `details` is reserved for fields the caller has explicitly allow-listed
 *    via `exposedDetails`. Nothing else from the source error reaches it.
 *
 * Stack traces, raw response bodies, and arbitrary enumerable properties on
 * the source error are *never* present unless a caller explicitly maps them
 * through.
 */
export interface NormalizedError {
  message: string;
  code: ErrorCode;
  statusCode?: number;
  details?: Record<string, unknown>;
}
