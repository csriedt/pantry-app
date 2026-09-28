import { GenericPayload } from "@/types/service/genericPayload";

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
