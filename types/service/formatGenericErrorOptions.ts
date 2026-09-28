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
