import { ZodType } from "zod";

import { GenericError } from "@/types/service/errors";

/**
 * Discriminated result of running a zod schema against unknown input.
 * Consume as `if (!result.success) return { error: result.error };` — TS
 * then narrows `result` to the success branch and `result.data` is the
 * schema's inferred type.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: GenericError };

/**
 * Validate untrusted input against a zod schema and return either the
 * parsed value or a service-flow {@link GenericError}.
 *
 * Field-level details are intentionally surfaced. Deny-by-default applies
 * to *internal/upstream* error material — validation errors describe the
 * caller's own input, so echoing back which paths failed and why is safe
 * and useful (and what every API consumer needs to fix their request).
 *
 * The emitted shape:
 * ```
 * {
 *   message: 'Invalid request.',
 *   code: 'validation',
 *   statusCode: 422,
 *   details: { issues: [{ path, message, code }, ...] },
 * ```
 *
 * `code: 'validation'` is in the recognised `ErrorCode` set, so a downstream
 * `formatGenericError` pass treats this as already-normalised and leaves
 * `details` intact.
 */
export const validateInput = <T>(
  schema: ZodType<T>,
  input: unknown
): ValidationResult<T> => {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };

  return {
    success: false,
    error: {
      message: "Invalid request.",
      code: "validation",
      statusCode: 422,
      details: {
        issues: parsed.error.issues.map(issue => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      },
    },
  };
};
