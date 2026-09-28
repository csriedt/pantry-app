import get from "lodash/get";

import { FetchHttpError } from "@/services/shared/fetchHttpError";
import { ErrorCode } from "@/types/service/errorCode";
import { FormatGenericErrorOptions } from "@/types/service/formatGenericErrorOptions";
import { NormalizedError } from "@/types/service/normalizedError";
import { codeFromStatus } from "./codeFromStatus";

const DEFAULT_MESSAGE = "An unexpected error occurred.";

/**
 * Recognised {@link ErrorCode} values, used to detect inputs that have already
 * been normalised so a second pass through this formatter does not re-mask
 * a previously-allowed message.
 */
const NORMALIZED_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "transport",
  "timeout",
  "unauthorized",
  "not_found",
  "validation",
  "http_4xx",
  "http_5xx",
  "missing_env",
  "missing_param",
  "unknown",
]);

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
    (process.env.NEXTJS_ENV === "development" ||
      process.env.NODE_ENV === "development") &&
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
