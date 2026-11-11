import { describe, expect, it } from "vitest";

import type { AiRates, AiUsage } from "@/lib/ai/cost";
import {
  estimateReservePico,
  picoToUsd,
  settlePicoCost,
} from "@/lib/ai/cost";

const rates: AiRates = {
  input: 300000,
  output: 3000000,
  cache_read: 30000,
  cache_write: 300000,
};

const zeroUsage: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

describe("lib/ai/cost", () => {
  it("settles a mixed request across all four buckets", () => {
    const usage: AiUsage = {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 200,
      cacheWriteTokens: 20,
    };

    const settledPicoCost = settlePicoCost(usage, rates);

    expect(settledPicoCost).toEqual(846_000_000);
  });

  it("prices cache reads at the cache-read rate", () => {
    const usage: AiUsage = {
      inputTokens: 100,
      outputTokens: 0,
      cacheReadTokens: 100,
      cacheWriteTokens: 0,
    };

    const settledPicoCost = settlePicoCost(usage, rates);

    expect(settledPicoCost).toEqual(3_000_000);
  });

  it("prices cache writes at the cache-write rate", () => {
    const usage: AiUsage = {
      inputTokens: 100,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 100,
    };

    const settledPicoCost = settlePicoCost(usage, rates);

    expect(settledPicoCost).toEqual(30_000_000);
  });

  it("settles empty usage as zero", () => {
    const settledPicoCost = settlePicoCost(zeroUsage, rates);

    expect(settledPicoCost).toEqual(0);
  });

  it("rejects cached tokens larger than total input", () => {
    const usage: AiUsage = {
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 100,
      cacheWriteTokens: 100,
    };

    expect(() => settlePicoCost(usage, rates)).toThrow(
      "cached tokens cannot exceed total input tokens",
    );
  });

  it("rejects a negative token count", () => {
    const usage: AiUsage = {
      ...zeroUsage,
      inputTokens: -1,
    };

    expect(() => settlePicoCost(usage, rates)).toThrow(
      "usage.inputTokens must be a non-negative safe integer",
    );
  });

  it("rejects a negative rate", () => {
    const badRates: AiRates = {
      ...rates,
      input: -1,
    };

    expect(() => settlePicoCost(zeroUsage, badRates)).toThrow(
      "rates.input must be a non-negative safe integer",
    );
  });

  it("estimates a reserve from prompt tokens plus the output cap", () => {
    const reservePico = estimateReservePico(1000, 500, rates);

    expect(reservePico).toEqual(1_800_000_000);
  });

  it("rejects a negative output cap", () => {
    expect(() => estimateReservePico(1000, -1, rates)).toThrow(
      "maxOutputTokens must be a non-negative safe integer",
    );
  });

  describe("picoToUsd", () => {
    it("converts a whole-dollar amount exactly", () => {
      expect(picoToUsd(1_000_000_000_000)).toEqual("1.000000000000");
    });

    it("keeps sub-cent precision", () => {
      expect(picoToUsd(300_000_000)).toEqual("0.000300000000");
    });

    it("does not round a single picoUSD to zero", () => {
      expect(picoToUsd(1)).toEqual("0.000000000001");
    });

    it("converts zero picoUSD", () => {
      expect(picoToUsd(0)).toEqual("0.000000000000");
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects invalid picoUSD value %s",
      (value) => {
        expect(() => picoToUsd(value)).toThrow(
          "pico must be a non-negative safe integer",
        );
      },
    );
  });
});
