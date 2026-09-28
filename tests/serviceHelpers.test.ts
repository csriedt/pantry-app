import type { Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { codeFromStatus } from "@/lib/service/codeFromStatus";
import { formatGenericError } from "@/lib/service/formatGenericError";
import { getErrorPayload } from "@/lib/service/getErrorPayload";
import type { GenericError } from "@/types/service/genericError";
import { getMissingEnvPayload } from "@/lib/service/getMissingEnvPayload";
import { getMissingParamPayload } from "@/lib/service/getMissingParamPayload";
import { ilikePattern } from "@/lib/service/ilikePattern";
import { isGenericError } from "@/lib/service/isGenericError";
import { pageEnvelope, pageRange } from "@/lib/service/paging";
import { stoppableRefetchInterval } from "@/lib/service/stoppableRefetchInterval";
import { validateInput } from "@/lib/service/validateInput";
import { FetchHttpError } from "@/services/shared/fetchHttpError";
import type { ExtendedApiError } from "@/types/service/extendedApiError";
import type { NormalizedError } from "@/types/service/normalizedError";

/**
 * Characterization tests for the pure helpers in lib/service.
 *
 * These pin the CURRENT behaviour of the layer. Known gaps are marked with
 * `// RED-LIST:` comments and are either pinned as-is or asserted as
 * desired-but-failing via `it.fails`. Do not change source to make these pass.
 */

const httpError = (status: number): FetchHttpError =>
  new FetchHttpError({
    status,
    url: "https://api.example.test/pets",
    method: "GET",
  });

describe("codeFromStatus", () => {
  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [404, "not_found"],
    [422, "validation"],
    [400, "http_4xx"],
    [418, "http_4xx"],
    [499, "http_4xx"],
    [500, "http_5xx"],
    [502, "http_5xx"],
    [599, "http_5xx"],
    [200, "unknown"],
    [302, "unknown"],
    [600, "unknown"],
    [undefined, "unknown"],
  ])("maps status %s to %s", (status, expected) => {
    expect(codeFromStatus(status)).toBe(expected);
  });
});

describe("formatGenericError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // getMissingEnvPayload logs server-side and formatGenericError may log in
    // development. Silence to keep test output deterministic.
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("FetchHttpError inference", () => {
    it.each([
      [404, "not_found"],
      [422, "validation"],
      [401, "unauthorized"],
      [403, "unauthorized"],
      [400, "http_4xx"],
      [429, "http_4xx"],
      [500, "http_5xx"],
      [503, "http_5xx"],
    ])("classifies FetchHttpError %i as %s", (status, code) => {
      const result = formatGenericError(httpError(status), {
        defaultMessage: "Safe.",
      });
      expect(result).toEqual({ message: "Safe.", code, statusCode: status });
    });
  });

  describe("Error inference", () => {
    it("maps an Error named TimeoutError to timeout", () => {
      const error = new Error("took too long");
      error.name = "TimeoutError";

      expect(
        formatGenericError(error, { defaultMessage: "Safe." })
      ).toEqual({ message: "Safe.", code: "timeout" });
    });

    it("maps an Error named AbortError to timeout", () => {
      const error = new Error("aborted");
      error.name = "AbortError";

      expect(
        formatGenericError(error, { defaultMessage: "Safe." })
      ).toEqual({ message: "Safe.", code: "timeout" });
    });

    it("maps undici's 'fetch failed' message to transport", () => {
      expect(
        formatGenericError(new TypeError("fetch failed"), {
          defaultMessage: "Safe.",
        })
      ).toEqual({ message: "Safe.", code: "transport" });
    });

    it("maps a message that merely contains 'fetch failed' to transport", () => {
      expect(
        formatGenericError(
          new TypeError("request to https://x failed, reason: fetch failed"),
          { defaultMessage: "Safe." }
        )
      ).toEqual({ message: "Safe.", code: "transport" });
    });

    it("leaves an unknown Error as unknown", () => {
      expect(
        formatGenericError(new Error("boom"), { defaultMessage: "Safe." })
      ).toEqual({ message: "Safe.", code: "unknown" });
    });
  });

  describe("plain-object inference", () => {
    it.each([
      [{ statusCode: 404 }, "not_found", 404],
      [{ statusCode: 422 }, "validation", 422],
      [{ statusCode: 401 }, "unauthorized", 401],
      [{ statusCode: 418 }, "http_4xx", 418],
      [{ statusCode: 503 }, "http_5xx", 503],
      [{ status: 404 }, "not_found", 404],
    ])("maps %o to code %s", (source, code, statusCode) => {
      expect(
        formatGenericError(source, { defaultMessage: "Safe." })
      ).toEqual({ message: "Safe.", code, statusCode });
    });

    it("prefers statusCode over status when both are numbers", () => {
      expect(
        formatGenericError(
          { statusCode: 404, status: 500 },
          { defaultMessage: "Safe." }
        )
      ).toEqual({ message: "Safe.", code: "not_found", statusCode: 404 });
    });

    it("keeps a non-error status (200) as-is with code unknown", () => {
      expect(
        formatGenericError({ statusCode: 200 }, { defaultMessage: "Safe." })
      ).toEqual({ message: "Safe.", code: "unknown", statusCode: 200 });
    });

    it.each(["ENOTFOUND", "ECONNREFUSED", "ERR_NETWORK", "NETWORK_ERROR"])(
      "maps legacy transport code %s to transport",
      code => {
        expect(
          formatGenericError({ code }, { defaultMessage: "Safe." })
        ).toEqual({ message: "Safe.", code: "transport" });
      }
    );

    it.each(["ECONNABORTED", "ETIMEDOUT", "ERR_TIMEOUT"])(
      "maps legacy timeout code %s to timeout",
      code => {
        expect(
          formatGenericError({ code }, { defaultMessage: "Safe." })
        ).toEqual({ message: "Safe.", code: "timeout" });
      }
    );

    it("does not pass legacy-coded objects through as already-normalized", () => {
      // A message + ECONNREFUSED must NOT be mistaken for a NormalizedError.
      expect(
        formatGenericError(
          { message: "dial tcp: refused", code: "ECONNREFUSED" },
          { defaultMessage: "Safe." }
        )
      ).toEqual({ message: "Safe.", code: "transport" });
    });
  });

  describe("already-normalized passthrough", () => {
    it("returns the identical object when message + known ErrorCode are present", () => {
      const input: NormalizedError = {
        message: "Kept.",
        code: "not_found",
        statusCode: 404,
        details: { issue: "x" },
      };

      const result = formatGenericError(input, {
        defaultMessage: "Replaced?",
      });

      expect(result).toBe(input);
      expect(result.message).toBe("Kept.");
      expect(result.details).toEqual({ issue: "x" });
    });

    it("passes through a hand-made { message, code: 'timeout' } object", () => {
      const input = { message: "Hand-made.", code: "timeout" };
      expect(formatGenericError(input)).toBe(input);
    });
  });

  describe("messages", () => {
    it("uses the generic default message for string input", () => {
      expect(formatGenericError("boom")).toEqual({
        message: "An unexpected error occurred.",
        code: "unknown",
      });
    });

    it("uses defaultMessage when provided", () => {
      expect(
        formatGenericError(new Error("raw"), { defaultMessage: "Custom." })
      ).toEqual({ message: "Custom.", code: "unknown" });
    });

    it("uses passThroughMessage for a string source", () => {
      expect(
        formatGenericError("raw detail", {
          defaultMessage: "Custom.",
          passThroughMessage: true,
        })
      ).toEqual({ message: "raw detail", code: "unknown" });
    });

    it("uses passThroughMessage for an object/Error message", () => {
      expect(
        formatGenericError(new Error("raw upstream"), {
          passThroughMessage: true,
        }).message
      ).toBe("raw upstream");
      expect(
        formatGenericError(
          { message: "from object" },
          { passThroughMessage: true }
        ).message
      ).toBe("from object");
    });

    it("falls back to defaultMessage when passThroughMessage has no string source", () => {
      expect(
        formatGenericError(
          { message: 42 },
          { defaultMessage: "Custom.", passThroughMessage: true }
        )
      ).toEqual({ message: "Custom.", code: "unknown" });
    });
  });

  describe("deny-by-default shape", () => {
    it("emits only message/code for an Error with no inferable status", () => {
      const result = formatGenericError(new Error("raw"), {
        defaultMessage: "Safe.",
      });

      expect(Object.keys(result).sort()).toEqual(["code", "message"]);
    });

    it("adds statusCode when inferred but never details/stack/name", () => {
      const result = formatGenericError(httpError(500), {
        defaultMessage: "Safe.",
      });

      expect(Object.keys(result).sort()).toEqual([
        "code",
        "message",
        "statusCode",
      ]);
      expect(result).toMatchObject({
        message: "Safe.",
        code: "http_5xx",
        statusCode: 500,
      });
    });
  });

  describe("exposedDetails", () => {
    it("exposes a string path under its leaf key", () => {
      const source = {
        message: "upstream",
        response: { data: { requestId: "req-1" } },
      };

      const result = formatGenericError(source, {
        defaultMessage: "Safe.",
        exposedDetails: ["response.data.requestId"],
      });

      expect(result.details).toEqual({ requestId: "req-1" });
    });

    it("supports { key, as, handler } and skips undefined values", () => {
      const source = {
        message: "upstream",
        response: { data: { requestId: "req-1", code: 400 } },
      };

      const result = formatGenericError(source, {
        defaultMessage: "Safe.",
        exposedDetails: [
          "response.data.requestId",
          { key: "response.data.code", as: "upstreamCode" },
          {
            key: "response.data.code",
            handler: value => `code:${String(value)}`,
          },
          { key: "response.data.missing", as: "never" },
          "also.missing",
        ],
      });

      expect(result.details).toEqual({
        requestId: "req-1",
        upstreamCode: 400,
        code: "code:400",
      });
    });

    it("omits details entirely when nothing resolves", () => {
      const result = formatGenericError(
        { message: "upstream" },
        { exposedDetails: ["nope.nope"] }
      );

      expect(result).not.toHaveProperty("details");
    });
  });
});

describe("getMissingParamPayload", () => {
  it("shapes a 400 missing_param payload with the param name", () => {
    expect(getMissingParamPayload("pets")).toEqual({
      error: {
        message: "Missing parameter: pets",
        code: "missing_param",
        statusCode: 400,
      },
    });
  });

  it("falls back to a name-less message when param is absent", () => {
    expect(getMissingParamPayload()).toEqual({
      error: {
        message: "Missing parameter",
        code: "missing_param",
        statusCode: 400,
      },
    });
  });

  it("accepts a custom status code", () => {
    expect(getMissingParamPayload("pets", 422)).toEqual({
      error: {
        message: "Missing parameter: pets",
        code: "missing_param",
        statusCode: 422,
      },
    });
  });
});

describe("getMissingEnvPayload", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the env name out of the payload and only in the server log", () => {
    const payload = getMissingEnvPayload("SECRET_API_KEY");

    expect(payload).toEqual({
      error: {
        message:
          "This action is temporarily unavailable. Please try again shortly.",
        code: "missing_env",
        statusCode: 500,
      },
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("SECRET_API_KEY");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[missing_env] Missing environment variable: SECRET_API_KEY"
    );
  });

  it("logs a name-less message when env is not provided", () => {
    const payload = getMissingEnvPayload();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[missing_env] Missing environment variable (name not provided)"
    );
    expect(payload.error).toMatchObject({ code: "missing_env", statusCode: 500 });
  });

  it("accepts a custom status code and user message", () => {
    expect(getMissingEnvPayload("X", 503, "Checkout unavailable.")).toEqual({
      error: {
        message: "Checkout unavailable.",
        code: "missing_env",
        statusCode: 503,
      },
    });
  });
});

describe("getErrorPayload", () => {
  it("derives code + status from a string message", () => {
    expect(getErrorPayload("Boom")).toEqual({
      error: { message: "Boom", code: "http_5xx", statusCode: 500 },
    });
    expect(getErrorPayload("Nope", 404)).toEqual({
      error: { message: "Nope", code: "not_found", statusCode: 404 },
    });
  });

  it("preserves a provided code but overrides statusCode", () => {
    expect(
      getErrorPayload({ message: "Bad.", code: "validation" }, 418)
    ).toEqual({
      error: { message: "Bad.", code: "validation", statusCode: 418 },
    });
  });

  it("derives the code from statusCode when the object has none", () => {
    expect(
      getErrorPayload({ message: "Bad." } as unknown as GenericError, 422)
    ).toEqual({
      error: { message: "Bad.", code: "validation", statusCode: 422 },
    });
  });

  it("falls back to codeFromStatus when a runtime object carries an unknown code", () => {
    expect(
      getErrorPayload(
        { message: "Bad.", code: "PGRST116" } as unknown as GenericError,
        418
      )
    ).toEqual({
      error: { message: "Bad.", code: "http_4xx", statusCode: 418 },
    });
  });

  it("defaults statusCode to 500 even for a provided code", () => {
    expect(getErrorPayload({ message: "Bad.", code: "not_found" })).toEqual({
      error: { message: "Bad.", code: "not_found", statusCode: 500 },
    });
  });
});

describe("isGenericError", () => {
  it.each([
    ["plain string", "boom", true],
    ["normalized object", { message: "m", code: "unknown" }, true],
    ["arbitrary code string", { message: "m", code: "NOT_A_CODE" }, true],
    ["missing code", { message: "m" }, false],
    ["missing message", { code: "unknown" }, false],
    ["non-string message", { message: 1, code: "unknown" }, false],
    ["non-string code", { message: "m", code: 7 }, false],
    ["array", [], false],
    ["null", null, false],
    ["undefined", undefined, false],
    ["number", 42, false],
    ["Error instance (message but no code)", new Error("boom"), false],
  ])("%s -> %s", (_label, input, expected) => {
    expect(isGenericError(input)).toBe(expected);
  });
});

describe("validateInput", () => {
  const schema = z.object({
    name: z.string(),
    count: z.number().default(3),
  });

  it("returns parsed data with schema defaults applied", () => {
    expect(validateInput(schema, { name: "Rex" })).toEqual({
      success: true,
      data: { name: "Rex", count: 3 },
    });
  });

  it("returns the current validation error shape on failure", () => {
    const result = validateInput(schema, {});

    expect(result).toEqual({
      success: false,
      error: {
        message: "Invalid request.",
        code: "validation",
        statusCode: 422,
        details: {
          issues: [
            {
              path: "name",
              message: expect.any(String),
              code: "invalid_type",
            },
          ],
        },
      },
    });
  });

  it("joins nested zod issue paths with dots", () => {
    const nested = z.object({
      profile: z.object({ age: z.number() }),
    });

    const result = validateInput(nested, { profile: {} });

    expect(result).toEqual({
      success: false,
      error: {
        message: "Invalid request.",
        code: "validation",
        statusCode: 422,
        details: {
          issues: [
            { path: "profile.age", message: expect.any(String), code: "invalid_type" },
          ],
        },
      },
    });
  });
});

describe("paging", () => {
  it.each([
    [1, 10, { from: 0, to: 9 }],
    [3, 10, { from: 20, to: 29 }],
    [2, 25, { from: 25, to: 49 }],
    [1, 1, { from: 0, to: 0 }],
  ])("pageRange(%i, %i) -> %o (inclusive)", (page, pageSize, expected) => {
    expect(pageRange(page, pageSize)).toEqual(expected);
  });

  it("pageEnvelope passes items/page/pageSize through", () => {
    expect(
      pageEnvelope({ items: ["a", "b"], count: 57, page: 3, pageSize: 2 })
    ).toEqual({ items: ["a", "b"], total: 57, page: 3, pageSize: 2 });
  });

  it("pageEnvelope falls back to items.length when count is null", () => {
    expect(
      pageEnvelope({ items: ["a"], count: null, page: 2, pageSize: 10 })
    ).toEqual({ items: ["a"], total: 1, page: 2, pageSize: 10 });
  });

  it("pageEnvelope preserves a real zero count", () => {
    expect(
      pageEnvelope({ items: [], count: 0, page: 1, pageSize: 10 })
    ).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
  });
});

describe("ilikePattern", () => {
  it("wraps a plain value in quotes and % wildcards", () => {
    expect(ilikePattern("Rex")).toBe('"%Rex%"');
    expect(ilikePattern("")).toBe('"%%"');
  });

  it("escapes LIKE metacharacters % _ and backslash", () => {
    expect(ilikePattern("50%_off\\now")).toBe('"%50\\%\\_off\\\\now%"');
  });

  it("escapes the quoted-value delimiter", () => {
    expect(ilikePattern('say "hi"')).toBe('"%say \\"hi\\"%"');
  });

  it("leaves PostgREST structural characters untouched inside the quotes", () => {
    expect(ilikePattern("Acme, Inc (HQ)")).toBe('"%Acme, Inc (HQ)%"');
  });
});

describe("stoppableRefetchInterval", () => {
  const asQuery = <T>(state: {
    data?: T | null;
    error?: unknown;
    dataUpdateCount?: number;
  }) =>
    ({ state }) as unknown as Query<
      T | null,
      ExtendedApiError,
      T | null,
      readonly unknown[]
    >;

  it("stops when data is present and attempts >= minAttempts", () => {
    const onStop = vi.fn();
    const query = asQuery({ data: { done: true }, dataUpdateCount: 5 });

    expect(stoppableRefetchInterval(query, 2000, onStop, undefined, 3)).toBe(
      false
    );
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith({ done: true }, 5);
  });

  it("keeps polling while data is present but attempts < minAttempts", () => {
    const onStop = vi.fn();
    const query = asQuery({ data: { done: true }, dataUpdateCount: 1 });

    expect(stoppableRefetchInterval(query, 2000, onStop, 10, 3)).toBe(2000);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("stops on error even when there is no data", () => {
    const onStop = vi.fn();
    const query = asQuery({
      data: undefined,
      error: new Error("boom"),
      dataUpdateCount: 2,
    });

    expect(stoppableRefetchInterval(query, 2000, onStop, 10, 0)).toBe(false);
    expect(onStop).toHaveBeenCalledWith(undefined, 2);
  });

  it("stops at maxAttempts", () => {
    const query = asQuery({ data: null, dataUpdateCount: 10 });
    expect(stoppableRefetchInterval(query, 2000, undefined, 10)).toBe(false);
  });

  it("uses the greater of maxAttempts and minAttempts as the exhaustive bound", () => {
    const below = asQuery({ data: null, dataUpdateCount: 3 });
    expect(stoppableRefetchInterval(below, 1000, undefined, 2, 5)).toBe(1000);

    const atBound = asQuery({ data: null, dataUpdateCount: 5 });
    expect(stoppableRefetchInterval(atBound, 1000, undefined, 2, 5)).toBe(
      false
    );
  });

  it("defaults dataUpdateCount to 0 and stops on data with the default minAttempts", () => {
    const onStop = vi.fn();
    const query = asQuery({ data: { done: true } });

    expect(stoppableRefetchInterval(query, 2000, onStop)).toBe(false);
    expect(onStop).toHaveBeenCalledWith({ done: true }, 0);
  });

  it("returns the configured interval (or false) when nothing says stop", () => {
    const query = asQuery({ data: null, dataUpdateCount: 0 });

    expect(stoppableRefetchInterval(query, 2000)).toBe(2000);
    expect(stoppableRefetchInterval(query)).toBe(false);
  });
});
