/**
 * Merged error-contract types for the service-flow stack: error codes, the
 * normalized error shape, generic error/payload types, formatter options,
 * and the `ExtendedApiError` class.
 */

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

/**
 * The error shape carried on `GenericPayload`. Always either a plain string
 * (for trivial, hand-crafted messages) or a fully {@link NormalizedError}.
 *
 * Any other shape is a bug — `formatGenericError` is the single authorised
 * producer of `NormalizedError` values from arbitrary inputs.
 */
export type GenericError = string | NormalizedError;

export interface GenericErrorPayload {
  error?: GenericError;
}

/**
 * Options for `formatGenericError`. The formatter is deny-by-default — every
 * field that would surface upstream-controlled data requires an explicit opt-in.
 *
 * - `defaultMessage`: the safe, user-facing message. Always returned as the
 *   normalized error's `message` unless `passThroughMessage` is enabled.
 *
 * - `passThroughMessage`: when true, use the *source* error's `message` field
 *   (if it's a string) as the normalized message. Falls back to `defaultMessage`
 *   when no message is available on the source. Off by default.
 *
 * - `exposedDetails`: explicit allow-list of source fields to surface under
 *   `details` on the normalized error. Anything not listed is dropped.
 *
 *   Each entry can be:
 *     - a string `'response.data.code'` — uses lodash `get`, emits under the
 *       same path-leaf key.
 *     - `{ key, as?, handler? }` — `as` renames the output key, `handler`
 *       transforms the value before it's emitted.
 *
 *   Keys that resolve to `undefined` are skipped silently. `stack`, `name`,
 *   and the raw `response.data` body cannot be exposed through this — pick
 *   the specific sub-paths you actually want.
 */
export interface FormatGenericErrorOptions {
  defaultMessage?: string;
  passThroughMessage?: boolean;
  exposedDetails?: (
    | string
    | { key: string; as?: string; handler?: (value: unknown) => unknown }
  )[];
}

/**
 * Custom error class to represent API errors with additional information.
 * Extends the built-in `Error` class to include extra properties such as
 * status code, timestamp, path, and validation errors in fields.
 */
export class ExtendedApiError extends Error {
  fields: { field: string; message: string }[];
  statusCode: number;
  timestamp: string;
  path: string;
  genericError?: GenericError;

  /**
   * Constructs a new `ExtendedApiError` instance.
   *
   * @param fields - Array of objects containing field-specific error information.
   * @param path - API endpoint path where the error occurred.
   * @param message - The error message.
   * @param statusCode - HTTP status code associated with the error.
   * @param timestamp - Timestamp indicating when the error occurred.
   * @param genericError - Optional GenericError from server actions.
   */
  constructor({
    fields,
    path,
    message,
    statusCode,
    timestamp,
    genericError,
  }: {
    path: string;
    statusCode: number;
    timestamp: string;
    message: string;
    fields: { field: string; message: string }[];
    genericError?: GenericError;
  }) {
    super(message); // Call the parent class constructor (Error)
    this.fields = fields;
    this.statusCode = statusCode;
    this.timestamp = timestamp;
    this.path = path;
    this.genericError = genericError;
  }

  /**
   * Helper factory method to create an ExtendedApiError from a GenericError
   */
  static fromGenericError(genericError: GenericError): ExtendedApiError {
    let message = "An error occurred";
    let statusCode = 500;
    let path = "unknown";

    // Extract information from genericError
    if (typeof genericError === "string") {
      message = genericError;
    } else if (typeof genericError === "object" && genericError !== null) {
      // Try to extract message
      if (
        "message" in genericError &&
        typeof genericError.message === "string"
      ) {
        message = genericError.message;
      } else {
        message = JSON.stringify(genericError);
      }

      // Try to extract status code
      if (
        "statusCode" in genericError &&
        typeof genericError.statusCode === "number"
      ) {
        statusCode = genericError.statusCode;
      } else if (
        "status" in genericError &&
        typeof genericError.status === "number"
      ) {
        statusCode = genericError.status;
      }

      // Try to extract path/url
      if ("path" in genericError && typeof genericError.path === "string") {
        path = genericError.path;
      } else if (
        "url" in genericError &&
        typeof genericError.url === "string"
      ) {
        path = genericError.url;
      }
    }

    return new ExtendedApiError({
      fields: [],
      path,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      genericError,
    });
  }
}
