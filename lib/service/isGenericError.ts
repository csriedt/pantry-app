import { GenericError } from "@/types/service/genericError";

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
