/**
 * AI cost math. Rates are integer picodollars per token
 * (1 USD = 1e12 picoUSD), inspired by the Tarsnap picoUSD note:
 * https://www.tarsnap.com/picoUSD-why.html
 *
 * These helpers are pure: no provider, no database, no serialization. The
 * caller maps AI SDK usage into `AiUsage`, and stores `picoToUsd` output as an
 * exact decimal string. Display rounding happens at the UI edge.
 */

/**
 * Rate card in picodollars per token. Keys match the seeded
 * `ai_models.rates` JSON.
 */
export interface AiRates {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

/**
 * Token usage for one inference call. `inputTokens` is the provider's total
 * input count and INCLUDES cache reads and writes; those cache buckets are
 * priced separately and removed from the uncached input bucket during settle.
 */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Picodollars in one US dollar. */
const PICOS_PER_USD = 1_000_000_000_000;

/**
 * Throw unless `value` is a whole number at or above zero. Guards every
 * monetary and token input so a mapping bug fails at the math boundary.
 */
function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

/** Validate every rate dimension before a settle or reserve calculation. */
function assertRates(rates: AiRates): void {
  assertNonNegativeSafeInteger(rates.input, "rates.input");
  assertNonNegativeSafeInteger(rates.output, "rates.output");
  assertNonNegativeSafeInteger(rates.cache_read, "rates.cache_read");
  assertNonNegativeSafeInteger(rates.cache_write, "rates.cache_write");
}

/** Validate every token bucket before a settle calculation. */
function assertUsage(usage: AiUsage): void {
  assertNonNegativeSafeInteger(usage.inputTokens, "usage.inputTokens");
  assertNonNegativeSafeInteger(usage.outputTokens, "usage.outputTokens");
  assertNonNegativeSafeInteger(usage.cacheReadTokens, "usage.cacheReadTokens");
  assertNonNegativeSafeInteger(usage.cacheWriteTokens, "usage.cacheWriteTokens");
}

/**
 * Settle actual usage into integer picoUSD. Cache tokens are charged at their
 * own rates; the remainder of `inputTokens` is charged at the uncached input
 * rate. Output tokens have no cache dimension.
 */
export const settlePicoCost = (usage: AiUsage, rates: AiRates): number => {
  assertUsage(usage);
  assertRates(rates);

  const uncachedInputTokens =
    usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens;

  if (uncachedInputTokens < 0) {
    throw new RangeError("cached tokens cannot exceed total input tokens");
  }

  return (
    uncachedInputTokens * rates.input +
    usage.outputTokens * rates.output +
    usage.cacheReadTokens * rates.cache_read +
    usage.cacheWriteTokens * rates.cache_write
  );
};

/**
 * Estimate the maximum hold for one call. Deliberately assumes every prompt
 * token is uncached and the output reaches `maxOutputTokens`; cache is priced
 * only at settle time from actual usage.
 */
export const estimateReservePico = (
  promptTokens: number,
  maxOutputTokens: number,
  rates: AiRates,
): number => {
  assertNonNegativeSafeInteger(promptTokens, "promptTokens");
  assertNonNegativeSafeInteger(maxOutputTokens, "maxOutputTokens");
  assertRates(rates);

  return promptTokens * rates.input + maxOutputTokens * rates.output;
};

/**
 * Convert integer picoUSD to an exact USD decimal string. The caller stores
 * this in `numeric`; the UI rounds for display.
 */
export const picoToUsd = (pico: number): string => {
  assertNonNegativeSafeInteger(pico, "pico");

  const whole = Math.floor(pico / PICOS_PER_USD);
  const fraction = String(pico % PICOS_PER_USD).padStart(12, "0");

  return `${whole}.${fraction}`;
};
