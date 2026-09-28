import { FormatGenericErrorOptions } from "./formatGenericErrorOptions";

/**
 * Per-request context handed to every middleware. Carries the merged
 * per-call / per-client `errorConfig` so error-formatting middleware can
 * surface the right shape without re-doing the merge.
 */
export interface RequestContext {
  errorConfig?: FormatGenericErrorOptions;
}

/**
 * Mutates / transforms the outgoing Request before `fetch` is called.
 * Returning a new Request (e.g. with new headers) is encouraged — Request
 * objects are immutable in practice once read, so middleware should always
 * return either the same instance or a freshly constructed one.
 */
export type RequestMiddleware = (
  req: Request,
  ctx: RequestContext
) => Request | Promise<Request>;

/**
 * Inspects / transforms the Response after `fetch` resolves. May throw to
 * abort the chain (this is how the error-formatting middleware surfaces
 * `!res.ok` to callers).
 */
export type ResponseMiddleware = (
  res: Response,
  req: Request,
  ctx: RequestContext
) => Response | Promise<Response>;

/**
 * Per-request options accepted by every client method (`.get`/`.post`/...).
 */
export interface RequestConfig {
  /** Appended to the URL as a query string. Null / undefined values are skipped. */
  params?: Record<string, unknown>;
  /** Extra headers merged on top of client defaults. */
  headers?: Record<string, string>;
  /** Caller-supplied abort signal. Combined with any client-wide controller. */
  signal?: AbortSignal;
  /** Per-call override for error formatting. Falls back to the client's default. */
  errorConfig?: FormatGenericErrorOptions;
  /** Per-call timeout in milliseconds. Falls back to the client's default. */
  timeoutMs?: number;
  /** Browser/runtime `RequestInit.cache` value. */
  cache?: RequestCache;
  /** Next.js fetch extensions — passes straight through to `fetch(..., { next })`. */
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}

/**
 * Body argument shape for `.post`/`.put`/`.patch`. Values that are not
 * strings / FormData / Blob / ArrayBuffer / URLSearchParams are
 * JSON-stringified; `application/json` Content-Type is auto-set when no
 * header already exists.
 *
 * `object` is intentionally broad so interface-typed request bodies (which
 * lack an index signature) and arrays both fit without forcing callers to
 * widen their types at the call site.
 */
export type RequestBody =
  | string
  | FormData
  | Blob
  | ArrayBuffer
  | URLSearchParams
  | object
  | null;

/** Response shape returned by every client method. */
export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/**
 * The HTTP client surface used by call sites. Each method returns
 * `{ data, status, headers }`; the body is JSON-parsed automatically on
 * `application/json` responses and string-parsed otherwise.
 */
export interface HttpClient {
  get<T = unknown>(
    url: string,
    config?: RequestConfig
  ): Promise<HttpResponse<T>>;
  delete<T = unknown>(
    url: string,
    config?: RequestConfig
  ): Promise<HttpResponse<T>>;
  post<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<HttpResponse<T>>;
  put<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<HttpResponse<T>>;
  patch<T = unknown>(
    url: string,
    body?: RequestBody,
    config?: RequestConfig
  ): Promise<HttpResponse<T>>;
}

/**
 * Configuration accepted by `HttpClientFactory.createClient`.
 */
export interface HttpClientConfig {
  /** Base URL prepended to every request path. */
  baseURL: string;
  /** Default request timeout in milliseconds. Per-call `timeoutMs` overrides. */
  timeout?: number;
  /** Headers applied to every request before per-call headers. */
  headers?: Record<string, string>;
  /** Default error-formatting options. Per-call `errorConfig` overrides. */
  errorConfig?: FormatGenericErrorOptions;
  /** Composed in array order before `fetch` is called. */
  requestMiddleware?: RequestMiddleware[];
  /**
   * Composed in array order after `fetch` resolves. The built-in error
   * middleware is appended automatically as the last entry, so consumer
   * middleware runs first.
   */
  responseMiddleware?: ResponseMiddleware[];
  /**
   * If true, the factory owns an AbortController whose signal is combined with
   * each request's. `abortRequests()` aborts it and creates a fresh one for
   * subsequent calls. Defaults to `false` — module-scoped AbortControllers
   * leak across requests in Cloudflare Workers. Opt in explicitly for
   * client-side use where cross-request abort cancellation is needed.
   */
  enableAbortController?: boolean;
}

/**
 * Returned by `HttpClientFactory.createClient`. Consumers destructure
 * `instance` to make calls and optionally call `abortRequests()` to cancel
 * everything in flight from this client.
 */
export interface ManagedHttpClient {
  instance: HttpClient;
  config: HttpClientConfig;
  abortController?: AbortController;
  resetAbortController?: () => void;
  abortRequests?: () => void;
}
