import { ErrorCode, isErrorCode } from "@/types/service/errorCode";
import { GenericError } from "@/types/service/genericError";
import { GenericPayload } from "@/types/service/genericPayload";
import { NormalizedError } from "@/types/service/normalizedError";
import { codeFromStatus } from "./codeFromStatus";

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
