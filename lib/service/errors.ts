/**
 * Merged error helpers for the service-flow stack: the transport's
 * `FetchHttpError`, status/code mapping, the deny-by-default formatter, and
 * the `getMissing*Payload` / `isGenericError` utilities.
 */

import get from "lodash/get";

import {
  ERROR_CODES,
  ErrorCode,
  FormatGenericErrorOptions,
  GenericError,
  NormalizedError,
  isErrorCode,
} from "@/types/service/errors";
import { GenericPayload } from "@/types/service/payloads";

/**
 * Error class raised by the fetch-based transport when a response has a
 * non-2xx status. Carries the minimal HTTP context the formatter needs
 * (`status`, `url`, `method`, optional parsed `body`) without leaking any
 * upstream-controlled fields by default.
 *
 * The presence of this class is the discriminator
 * {@link formatGenericError} uses to derive `code`/`statusCode` from a
 * fetch error in {@link inferCodeAndStatus}.
 */
export class FetchHttpError extends Error {
  status: number;
  url: string;
  method: string;
  body?: unknown;

  constructor(opts: {
    status: number;
    url: string;
    method: string;
    body?: unknown;
  }) {
    super(`HTTP ${opts.status} ${opts.method} ${opts.url}`);
    this.name = "FetchHttpError";
    this.status = opts.status;
    this.url = opts.url;
    this.method = opts.method;
    this.body = opts.body;
  }
}

/**
 * Map an HTTP status code to a stable {@link ErrorCode} bucket. Returns
 * `'unknown'` when the status is undefined or not in the 4xx/5xx range.
 *
 * Kept in one place so every error-emitting layer — formatter, payload
 * helpers, custom resolvers — agrees on the categorisation downstream
 * consumers branch on.
 */
export const codeFromStatus = (status: number | undefined): ErrorCode => {
  if (status === undefined) return "unknown";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 422) return "validation";
  if (status >= 400 && status < 500) return "http_4xx";
  if (status >= 500 && status < 600) return "http_5xx";
  return "unknown";
};

const DEFAULT_MESSAGE = "An unexpected error occurred.";

/**
 * Recognised {@link ErrorCode} values, used to detect inputs that have already
 * been normalised so a second pass through this formatter does not re-mask
 * a previously-allowed message.
 */
const NORMALIZED_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(ERROR_CODES);

/**
 * Pass-through guard for inputs that are already shaped as a NormalizedError.
 * We require both a string `message` AND a `code` that's a recognised
 * ErrorCode. The enum check rules out raw transport errors that happen to
 * carry their own `code` field (e.g. `'ERR_NETWORK'`), which would otherwise
 * masquerade as already-normalised values.
 */
const isAlreadyNormalized = (value: unknown): value is NormalizedError => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value instanceof Error) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.message !== "string") return false;
  if (typeof record.code !== "string") return false;
  return NORMALIZED_CODES.has(record.code as ErrorCode);
};

/**
 * Best-effort inference of what category an unknown error falls into.
 *
 * Primary discriminator is {@link FetchHttpError} (thrown by the
 * service-flow transport on `!res.ok`). Outside of that we look at:
 *  - The standard `AbortError` / `TimeoutError` `name` for cancel/timeout
 *  - A `'fetch failed'` message — undici's network-failure marker
 *  - Plain objects carrying `statusCode` / `status` (hand-crafted payloads
 *    from `getMissingEnvPayload`, etc.)
 *  - Legacy node-style error codes (`ECONNREFUSED`, `ENOTFOUND`, …) in case
 *    a non-fetch error surfaces from third-party deps.
 */
const inferCodeAndStatus = (
  error: unknown
): { code: ErrorCode; statusCode?: number } => {
  if (error instanceof FetchHttpError) {
    return { code: codeFromStatus(error.status), statusCode: error.status };
  }

  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return { code: "timeout" };
    }
    // undici (Node's fetch impl) surfaces network failures with this message.
    if (
      error.message === "fetch failed" ||
      error.message.includes("fetch failed")
    ) {
      return { code: "transport" };
    }
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const status =
      typeof record.statusCode === "number"
        ? record.statusCode
        : typeof record.status === "number"
          ? record.status
          : undefined;
    if (status !== undefined) {
      return { code: codeFromStatus(status), statusCode: status };
    }
    if (typeof record.code === "string") {
      const code = record.code;
      if (
        code === "ECONNABORTED" ||
        code === "ETIMEDOUT" ||
        code === "ERR_TIMEOUT"
      ) {
        return { code: "timeout" };
      }
      if (
        code === "ENOTFOUND" ||
        code === "ECONNREFUSED" ||
        code === "ERR_NETWORK" ||
        code === "NETWORK_ERROR"
      ) {
        return { code: "transport" };
      }
    }
  }

  return { code: "unknown" };
};

/**
 * Resolve an optional, opt-in message from the source error. Used only when
 * the caller sets `passThroughMessage`. Never reads beyond `error.message` —
 * deeper paths (response.data.message etc.) must be opt-in via
 * `exposedDetails`.
 */
const resolvePassThroughMessage = (error: unknown): string | undefined => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
};

/**
 * Apply the `exposedDetails` allow-list to the source error. Anything not
 * named here is dropped.
 */
const buildDetails = (
  source: unknown,
  exposedDetails: FormatGenericErrorOptions["exposedDetails"]
): Record<string, unknown> | undefined => {
  if (!exposedDetails || exposedDetails.length === 0) return undefined;
  if (!source || (typeof source !== "object" && typeof source !== "string"))
    return undefined;

  const out: Record<string, unknown> = {};

  for (const entry of exposedDetails) {
    if (typeof entry === "string") {
      const value = get(source, entry);
      if (value !== undefined) {
        const leaf = entry.split(".").pop() ?? entry;
        out[leaf] = value;
      }
      continue;
    }

    if (entry && typeof entry === "object" && typeof entry.key === "string") {
      const value = get(source, entry.key);
      if (value === undefined) continue;
      const outKey = entry.as ?? entry.key.split(".").pop() ?? entry.key;
      out[outKey] = entry.handler ? entry.handler(value) : value;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
};

/**
 * Normalise any thrown value into a {@link NormalizedError}.
 *
 * Deny-by-default contract:
 *  - `message` is the caller-supplied `defaultMessage` unless
 *    `passThroughMessage` is explicitly enabled.
 *  - `code` is a stable enum derived from the source; never an upstream string.
 *  - `statusCode` is the HTTP status if one could be inferred.
 *  - `details` is empty unless the caller named specific source paths via
 *    `exposedDetails`. Raw stacks, response bodies, and arbitrary enumerable
 *    properties on the source error are never surfaced.
 */
export const formatGenericError = (
  error: unknown,
  options?: FormatGenericErrorOptions
): NormalizedError => {
  const {
    defaultMessage = DEFAULT_MESSAGE,
    passThroughMessage,
    exposedDetails,
  } = options ?? {};

  if (
    process.env.NODE_ENV === "development" &&
    typeof window === "undefined"
  ) {
    console.error("[formatGenericError] raw source:", error);
  }

  // The transport-layer error middleware formats errors before they leave the
  // transport. Server actions then catch and re-call this. Without a guard,
  // the second pass would reset the caller-approved message back to
  // defaultMessage.
  if (isAlreadyNormalized(error)) {
    return error;
  }

  const { code, statusCode } = inferCodeAndStatus(error);

  let message = defaultMessage;
  if (passThroughMessage) {
    const passed = resolvePassThroughMessage(error);
    if (passed) message = passed;
  }

  const details = buildDetails(error, exposedDetails);

  const normalized: NormalizedError = { message, code };
  if (statusCode !== undefined) normalized.statusCode = statusCode;
  if (details) normalized.details = details;

  return normalized;
};

/**
 * Helper to create a custom error payload with a specific status code.
 * Accepts either a plain message or a partial {@link NormalizedError}; the
 * resulting payload always carries a stable `code` and the supplied
 * `statusCode`.
 *
 * @param error - The error message (string) or partial normalized error
 * @param statusCode - The HTTP status code
 */
export const getErrorPayload = <T>(
  error: string | GenericError,
  statusCode: number = 500
): GenericPayload<T> => {
  const code: ErrorCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    isErrorCode((error as { code: unknown }).code)
      ? (error as NormalizedError).code
      : codeFromStatus(statusCode);

  const errorObj: NormalizedError =
    typeof error === "string"
      ? { message: error, code, statusCode }
      : { ...(error as NormalizedError), code, statusCode };

  return { error: errorObj };
};

/**
 * Shape a service-flow error payload for a missing required env variable.
 *
 * ## Disclosure model
 *
 * The env var name is used ONLY for a server-side `console.error` — the
 * `error.message` the caller returns to the client is always neutral.
 * Leaking exact env-var names from a user-facing action is a small but
 * real disclosure surface (they hint at infra shape, provider choices,
 * and which knobs an attacker could probe against). Server logs are the
 * right home for that detail.
 *
 * Callers who want a domain-specific user message (e.g. "Checkout is
 * temporarily unavailable" instead of the generic default) can pass one
 * via `userMessage`. The default is deliberately vague and safe.
 *
 * ## Signature is additive
 *
 * `env` is still positional arg 1 and `statusCode` positional arg 2 —
 * so every existing caller keeps working with zero changes, and simply
 * stops leaking. `userMessage` is a new optional third param.
 *
 * @param env         Missing env variable name — logged only, never surfaced.
 * @param statusCode  HTTP status attached to the payload (default 500).
 * @param userMessage Optional override for the user-facing message.
 */
export const getMissingEnvPayload = <T>(
  env?: string,
  statusCode: number = 500,
  userMessage: string = "This action is temporarily unavailable. Please try again shortly."
): GenericPayload<T> => {
  // Server-side log — precise, for the operator. Bracketed tag matches
  // the [<domain>] convention used elsewhere (e.g. [pricing],
  // [subscription callback]) so ops can grep by prefix.
  if (env) {
    console.error(`[missing_env] Missing environment variable: ${env}`);
  } else {
    console.error("[missing_env] Missing environment variable (name not provided)");
  }
  return {
    error: {
      message: userMessage,
      code: "missing_env",
      statusCode,
    },
  };
};

/**
 * Helper to return a missing param variable error payload
 * @param param - The name of the missing parameter
 * @param statusCode - The HTTP status code (defaults to 400 Bad Request)
 * @returns {GenericPayload<T>} Error payload indicating missing parameter
 */
export const getMissingParamPayload = <T>(
  param?: string,
  statusCode: number = 400
): GenericPayload<T> => {
  return {
    error: {
      message: param ? `Missing parameter: ${param}` : "Missing parameter",
      code: "missing_param",
      statusCode,
    },
  };
};

/**
 * Helper to return an unauthorized error payload — no resolvable session
 * for a request that needs one. Generic over the caller's payload type so
 * it drops straight into a `return` at any action's identity check.
 *
 * Semantically this is the *authentication*-shaped failure (nobody is
 * identified), but the code follows the enum, which has one `unauthorized`
 * slot for HTTP 401/403 — matching the registry's own "401 Unauthorized"
 * label, whose meaning is closer to "unauthenticate". The name tracks the
 * code so the two never disagree.
 */
export const getUnauthorizedPayload = <T>(): GenericPayload<T> => ({
  error: {
    message: "Not signed in.",
    code: "unauthorized",
    statusCode: 401,
  },
});

/**
 * Type-guard for {@link GenericError}. Accepts either a plain string or an
 * object with the minimal NormalizedError surface (`message: string`,
 * `code: string`). Does *not* validate `code` against the ErrorCode enum —
 * callers that need that should branch on the `code` value themselves.
 */
export const isGenericError = (error: unknown): error is GenericError => {
  if (typeof error === "string") return true;
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;

  const record = error as Record<string, unknown>;
  return typeof record.message === "string" && typeof record.code === "string";
};
