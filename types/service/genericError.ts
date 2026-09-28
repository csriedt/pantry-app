import { NormalizedError } from "./normalizedError";

/**
 * The error shape carried on `GenericPayload`. Always either a plain string
 * (for trivial, hand-crafted messages) or a fully {@link NormalizedError}.
 *
 * Any other shape is a bug — `formatGenericError` is the single authorised
 * producer of `NormalizedError` values from arbitrary inputs.
 */
export type GenericError = string | NormalizedError;
