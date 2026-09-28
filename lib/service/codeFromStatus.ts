import { ErrorCode } from "@/types/service/errorCode";

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
