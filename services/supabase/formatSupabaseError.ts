import { PostgrestError } from "@supabase/supabase-js";

import { codeFromStatus } from "@/lib/service/errors";
import { GenericError } from "@/types/service/errors";

/**
 * Normalise a Supabase `PostgrestError` into the service-flow
 * {@link GenericError} shape. `formatGenericError` reads HTTP-shaped
 * errors; Postgrest errors carry a SQLSTATE-adjacent code and no status,
 * so a raw pass-through would land on `code: 'unknown'`.
 *
 * The `message` is always the caller-supplied default — deny-by-default,
 * same as the transport layer.
 */
export function formatSupabaseError(
  error: PostgrestError,
  defaultMessage: string,
): GenericError {
  // Operator-side log: the returned error hides upstream detail, so without
  // this the failure is invisible in production.
  console.error(
    `[supabase_error] ${defaultMessage} — code=${error.code ?? "?"} message=${error.message ?? "?"}`,
    { details: error.details, hint: error.hint },
  );

  let statusCode: number | undefined;
  switch (error.code) {
    case "PGRST116":
      statusCode = 404;
      break;
    case "PGRST301":
    case "42501":
      statusCode = 403;
      break;
    case "23505":
    case "23503":
      statusCode = 409;
      break;
    case "23514":
      statusCode = 422;
      break;
    default:
      statusCode = undefined;
  }

  const normalized: GenericError = {
    message: defaultMessage,
    code: codeFromStatus(statusCode),
  };
  if (statusCode !== undefined) normalized.statusCode = statusCode;
  return normalized;
}
