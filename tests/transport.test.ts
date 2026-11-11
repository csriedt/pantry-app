import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { formatGenericError } from "@/lib/service/errors";
import { createAuthInterceptor } from "@/services/shared/interceptors";
import { createHeaderInterceptor } from "@/services/shared/interceptors";
import {
  HttpClientFactory,
  type HttpClientConfig,
  type ResponseMiddleware,
} from "@/services/shared/client";

/**
 * Characterization tests for the HTTP transport in services/shared.
 *
 * `fetch` is always stubbed with a vitest mock that returns real `Response`
 * objects (and, for abort tests, a real signal-aware never-resolving promise).
 * Known gaps are marked `// RED-LIST:` and pinned as-is or via `it.fails`.
 * Do not change source to make these pass.
 */

type FetchImpl = (req: Request) => Promise<Response>;

let fetchMock: Mock<FetchImpl>;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const createClient = (
  config: Omit<HttpClientConfig, "baseURL"> & { baseURL?: string } = {}
) =>
  HttpClientFactory.createClient({
    baseURL: "https://api.example.test/api",
    ...config,
  }).instance;

const lastRequest = (): Request => {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return call[0];
};

/**
 * Mimics real fetch's abort contract: the promise never resolves on its own,
 * but rejects with the request signal's reason when that signal aborts.
 */
const rejectOnAbort = (req: Request): Promise<Response> =>
  new Promise<Response>((_resolve, reject) => {
    if (req.signal.aborted) {
      reject(req.signal.reason);
      return;
    }
    req.signal.addEventListener("abort", () => reject(req.signal.reason));
  });

beforeEach(() => {
  fetchMock = vi.fn<FetchImpl>(async () => jsonResponse({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("URL building", () => {
  it("normalizes a trailing slash in baseURL", async () => {
    const client = createClient({ baseURL: "https://api.example.test/api/" });
    await client.get("/pets");

    expect(lastRequest().url).toBe("https://api.example.test/api/pets");
  });

  it("inserts the missing slash when baseURL has none", async () => {
    await createClient().get("pets");

    expect(lastRequest().url).toBe("https://api.example.test/api/pets");
  });

  it("skips null/undefined params and stringifies the rest", async () => {
    await createClient().get("/pets", {
      params: {
        status: "available",
        page: 2,
        active: false,
        empty: "",
        missing: undefined,
        nothing: null,
      },
    });

    const { searchParams } = new URL(lastRequest().url);
    expect(searchParams.get("status")).toBe("available");
    expect(searchParams.get("page")).toBe("2");
    expect(searchParams.get("active")).toBe("false");
    expect(searchParams.get("empty")).toBe("");
    expect(searchParams.has("missing")).toBe(false);
    expect(searchParams.has("nothing")).toBe(false);
  });

  it("appends array params as repeated keys", async () => {
    await createClient().get("/pets", { params: { tag: ["a", "b", 3] } });

    expect(new URL(lastRequest().url).searchParams.getAll("tag")).toEqual([
      "a",
      "b",
      "3",
    ]);
  });

  it("overrides an existing query value via set and keeps the others", async () => {
    await createClient().get("/pets?status=available&page=1", {
      params: { page: 2 },
    });

    const { searchParams } = new URL(lastRequest().url);
    expect(searchParams.get("status")).toBe("available");
    expect(searchParams.getAll("page")).toEqual(["2"]);
  });

  // A path must stay on the configured origin; anything that would replace
  // baseURL is rejected rather than silently followed.
  it("rejects an absolute path that would replace baseURL", async () => {
    await expect(
      createClient().get("https://evil.example.test/pets")
    ).rejects.toThrow(/relative to the client's baseURL/);
  });

  it("rejects a protocol-relative path", async () => {
    await expect(
      createClient().get("//evil.example.test/pets")
    ).rejects.toThrow(/relative to the client's baseURL/);
  });
});

describe("headers", () => {
  it("merges factory defaults first, then per-call overrides win", async () => {
    const client = createClient({
      headers: { "X-Source": "factory", "X-Override": "factory" },
    });

    await client.get("/pets", {
      headers: { "X-Override": "call", "X-Call": "call" },
    });

    const headers = lastRequest().headers;
    expect(headers.get("x-source")).toBe("factory");
    expect(headers.get("x-override")).toBe("call");
    expect(headers.get("x-call")).toBe("call");
  });
});

describe("body serialization", () => {
  it("JSON-stringifies plain objects and auto-sets Content-Type when absent", async () => {
    await createClient().post("/pets", { name: "Rex", tags: ["good"] });

    const req = lastRequest();
    expect(req.headers.get("content-type")).toBe("application/json");
    expect(await req.text()).toBe('{"name":"Rex","tags":["good"]}');
  });

  it("preserves an explicit non-JSON Content-Type (body is still JSON-encoded)", async () => {
    await createClient().post(
      "/pets",
      { a: 1 },
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const req = lastRequest();
    expect(req.headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded"
    );
    expect(await req.text()).toBe('{"a":1}');
  });

  it("passes string bodies through (fetch defaults the content type)", async () => {
    await createClient().post("/pets", "raw-text");

    const req = lastRequest();
    // buildUrl leaves it unset; undici's Request adds the text/plain default.
    expect(req.headers.get("content-type")).toBe("text/plain;charset=UTF-8");
    expect(await req.text()).toBe("raw-text");
  });

  it("passes URLSearchParams through as urlencoded", async () => {
    await createClient().post(
      "/pets",
      new URLSearchParams({ a: "1", b: "two words" })
    );

    const req = lastRequest();
    expect(req.headers.get("content-type")).toContain(
      "application/x-www-form-urlencoded"
    );
    expect(await req.text()).toBe("a=1&b=two+words");
  });

  it("passes FormData through and lets fetch set the multipart boundary", async () => {
    const form = new FormData();
    form.set("name", "Rex");
    form.set("file", new Blob(["data"]), "rex.txt");

    await createClient().post("/pets", form);

    const req = lastRequest();
    expect(req.headers.get("content-type")).toMatch(
      /^multipart\/form-data; boundary=/
    );

    const echoed = await req.formData();
    expect(echoed.get("name")).toBe("Rex");
    const file = echoed.get("file");
    expect(file).toBeInstanceOf(File);
    expect(await (file as File).text()).toBe("data");
  });
});

describe("response parsing", () => {
  it("parses application/json and returns status + headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }, 201));

    const res = await createClient().get<{ ok: boolean }>("/pets");

    expect(res.data).toEqual({ ok: true });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("returns undefined for 204 and 205 with no body read", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const noContent = await createClient().get("/pets");
    expect(noContent.data).toBeUndefined();
    expect(noContent.status).toBe(204);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 205 }));
    const resetContent = await createClient().get("/pets");
    expect(resetContent.data).toBeUndefined();
    expect(resetContent.status).toBe(205);
  });

  it("returns text for non-JSON content types", async () => {
    fetchMock.mockResolvedValue(
      new Response("hello", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    );

    const res = await createClient().get<string>("/pets");

    expect(res.data).toBe("hello");
  });

  it("treats a 2xx empty JSON body as undefined", async () => {
    fetchMock.mockResolvedValue(
      new Response("", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await createClient().get("/pets");

    expect(res.data).toBeUndefined();
  });

  it("parses application/vnd.api+json as JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/vnd.api+json" },
      })
    );

    const res = await createClient().get<{ ok: boolean }>("/pets");

    expect(res.data).toEqual({ ok: true });
  });
});

describe("error responses", () => {
  it.each([
    [404, "not_found"],
    [422, "validation"],
    [401, "unauthorized"],
    [500, "http_5xx"],
    [503, "http_5xx"],
  ])("throws a normalized plain object for HTTP %i (%s)", async (status, code) => {
    fetchMock.mockResolvedValue(new Response("upstream body", { status }));

    const thrown = await createClient()
      .get("/pets")
      .catch(error => error);

    expect(thrown).not.toBeInstanceOf(Error);
    expect(thrown).toEqual({
      message: "An unexpected error occurred.",
      code,
      statusCode: status,
    });
  });

  it("does not leak the upstream error body or status beyond the contract", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: "Internal secret", token: "abc" }, 500)
    );

    const thrown = await createClient()
      .get("/pets")
      .catch(error => error);

    expect(thrown).toEqual({
      message: "An unexpected error occurred.",
      code: "http_5xx",
      statusCode: 500,
    });
    expect(thrown).not.toHaveProperty("details");
  });

  it("uses the client errorConfig by default and the per-call override when given", async () => {
    const client = createClient({
      errorConfig: { defaultMessage: "Client default." },
    });

    fetchMock.mockResolvedValue(new Response("x", { status: 500 }));
    await expect(client.get("/pets")).rejects.toMatchObject({
      message: "Client default.",
    });

    fetchMock.mockResolvedValue(new Response("x", { status: 500 }));
    await expect(
      client.get("/pets", { errorConfig: { defaultMessage: "Per-call." } })
    ).rejects.toMatchObject({ message: "Per-call." });
  });
});

describe("middleware", () => {
  it("runs consumer response middleware before the built-in error interceptor", async () => {
    const order: string[] = [];
    const recorder: ResponseMiddleware = res => {
      order.push(`consumer:${res.status}`);
      return res;
    };
    const client = createClient({ responseMiddleware: [recorder] });

    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await client.get("/pets");
    expect(order).toEqual(["consumer:200"]);

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(client.get("/pets")).rejects.toMatchObject({
      code: "not_found",
    });
    // The consumer saw the !ok response before the interceptor threw.
    expect(order).toEqual(["consumer:200", "consumer:404"]);
  });

  it("lets a consumer response middleware replace an error response before the interceptor sees it", async () => {
    const client = createClient({
      responseMiddleware: [() => jsonResponse({ recovered: true })],
    });

    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const res = await client.get<{ recovered: boolean }>("/pets");

    expect(res.data).toEqual({ recovered: true });
    expect(res.status).toBe(200);
  });

  it("lets createAuthInterceptor add a bearer token", async () => {
    const client = createClient({
      requestMiddleware: [createAuthInterceptor(async () => "token-123")],
    });

    await client.get("/pets");

    expect(lastRequest().headers.get("authorization")).toBe("Bearer token-123");
  });

  it("createAuthInterceptor leaves the header untouched when the token is falsy", async () => {
    const client = createClient({
      requestMiddleware: [createAuthInterceptor(async () => null)],
    });

    await client.get("/pets");

    expect(lastRequest().headers.has("authorization")).toBe(false);
  });

  it("createHeaderInterceptor sets non-empty values and skips empty ones", async () => {
    const client = createClient({
      requestMiddleware: [
        createHeaderInterceptor({ "X-Api-Key": "key-1", "X-Empty": "" }),
      ],
    });

    await client.get("/pets");

    const headers = lastRequest().headers;
    expect(headers.get("x-api-key")).toBe("key-1");
    expect(headers.has("x-empty")).toBe(false);
  });
});

describe("timeouts and aborts", () => {
  it("aborts on timeout and throws a TimeoutError", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(rejectOnAbort);
    const client = createClient({ timeout: 50 });

    const settled = client.get("/slow").catch(error => error);
    await vi.advanceTimersByTimeAsync(50);
    const error = await settled;

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TimeoutError");
    expect(error.message).toBe("Request timed out after 50ms");
    expect(formatGenericError(error)).toMatchObject({ code: "timeout" });
  });

  it("per-call timeoutMs overrides the client default", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(rejectOnAbort);
    const client = createClient({ timeout: 5000 });

    const settled = client.get("/slow", { timeoutMs: 25 }).catch(e => e);
    await vi.advanceTimersByTimeAsync(25);
    const error = await settled;

    expect(error.name).toBe("TimeoutError");
    expect(error.message).toBe("Request timed out after 25ms");
  });

  // RED-LIST: caller cancellation and transport timeout are indistinguishable
  // downstream (both format to code: 'timeout'); a distinct outcome is an open
  // decision, still open.
  it("maps a caller abort to code: 'timeout' (formatGenericError)", async () => {
    fetchMock.mockImplementation(rejectOnAbort);
    const controller = new AbortController();
    controller.abort();

    const error = await createClient()
      .get("/pets", { signal: controller.signal })
      .catch(e => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AbortError");
    expect(formatGenericError(error)).toMatchObject({ code: "timeout" });
  });

  // The timeout bounds the whole operation, including the body read. A custom
  // stream (like this stub) is not tied to the request signal, so the race in
  // the transport — not the fetch implementation — is what rejects the call.
  it("bounds the body read with the timeout", async () => {
    vi.useFakeTimers();
    const body = new ReadableStream<Uint8Array>({ start() {} }); // never closes
    fetchMock.mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const client = createClient({ timeout: 50 });

    const promise = client.get<{ ok: boolean }>("/slow-body");
    const assertion = expect(promise).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});
