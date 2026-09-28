import {
  HttpClient,
  HttpClientConfig,
  HttpResponse,
  ManagedHttpClient,
  RequestBody,
  RequestConfig,
  RequestContext,
  RequestMiddleware,
  ResponseMiddleware,
} from "@/types/service/httpClientConfig";
import { createErrorFormattingInterceptor } from "./createErrorInterceptor";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const buildUrl = (
  baseURL: string,
  path: string,
  params?: Record<string, unknown>
): string => {
  // URL handles both absolute paths and ones already containing the base.
  const normalizedBase = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const full = new URL(normalizedPath, normalizedBase);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) full.searchParams.append(k, String(item));
      } else {
        full.searchParams.set(k, String(v));
      }
    }
  }

  return full.toString();
};

const combineSignals = (
  signals: (AbortSignal | undefined)[]
): AbortSignal | undefined => {
  const present = signals.filter((s): s is AbortSignal => s !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  // AbortSignal.any is available in Node 19.7+ and all evergreen browsers.
  return AbortSignal.any(present);
};

const serializeBody = (
  body: RequestBody | undefined,
  headers: Headers
): BodyInit | undefined => {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof FormData) return body;
  if (body instanceof Blob) return body;
  if (body instanceof ArrayBuffer) return body;
  if (body instanceof URLSearchParams) return body;
  // Plain object / array — JSON-encode and set Content-Type if absent.
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return JSON.stringify(body);
};

const parseResponseBody = async (res: Response): Promise<unknown> => {
  if (res.status === 204 || res.status === 205) return undefined;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
};

class FetchHttpClient implements HttpClient {
  constructor(
    private readonly factoryConfig: HttpClientConfig,
    private readonly responseChain: ResponseMiddleware[],
    private readonly getClientSignal: () => AbortSignal | undefined
  ) {}

  get<T = unknown>(url: string, config?: RequestConfig) {
    return this.request<T>("GET", url, undefined, config);
  }

  delete<T = unknown>(url: string, config?: RequestConfig) {
    return this.request<T>("DELETE", url, undefined, config);
  }

  post<T = unknown>(url: string, body?: RequestBody, config?: RequestConfig) {
    return this.request<T>("POST", url, body, config);
  }

  put<T = unknown>(url: string, body?: RequestBody, config?: RequestConfig) {
    return this.request<T>("PUT", url, body, config);
  }

  patch<T = unknown>(url: string, body?: RequestBody, config?: RequestConfig) {
    return this.request<T>("PATCH", url, body, config);
  }

  private async request<T>(
    method: Method,
    path: string,
    body: RequestBody | undefined,
    config?: RequestConfig
  ): Promise<HttpResponse<T>> {
    const url = buildUrl(this.factoryConfig.baseURL, path, config?.params);

    // Merge headers: factory defaults → per-call overrides.
    const headers = new Headers(this.factoryConfig.headers ?? {});
    if (config?.headers) {
      for (const [k, v] of Object.entries(config.headers)) headers.set(k, v);
    }

    const init: RequestInit & { next?: RequestConfig["next"] } = {
      method,
      headers,
      body: serializeBody(body, headers),
      ...(config?.cache !== undefined ? { cache: config.cache } : {}),
      ...(config?.next !== undefined ? { next: config.next } : {}),
    };

    // Combine signals: caller's, client-wide controller, optional timeout.
    const timeoutMs = config?.timeoutMs ?? this.factoryConfig.timeout;
    const timeoutController = timeoutMs ? new AbortController() : undefined;
    const timeoutHandle =
      timeoutMs && timeoutController
        ? setTimeout(() => timeoutController.abort(), timeoutMs)
        : undefined;

    init.signal = combineSignals([
      config?.signal,
      this.getClientSignal(),
      timeoutController?.signal,
    ]);

    let req = new Request(url, init);

    const ctx: RequestContext = {
      errorConfig: config?.errorConfig ?? this.factoryConfig.errorConfig,
    };

    // Apply request middleware in declaration order.
    for (const mw of this.factoryConfig.requestMiddleware ?? []) {
      req = await mw(req, ctx);
    }

    let res: Response;
    try {
      res = await fetch(req);
    } catch (err) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      // Translate timeout-driven aborts into a recognisable error name so
      // formatGenericError can map it to `code: 'timeout'`.
      if (timeoutController?.signal.aborted) {
        const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms`);
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      }
      throw err;
    }

    if (timeoutHandle) clearTimeout(timeoutHandle);

    // Apply response middleware (built-in error middleware runs last).
    for (const mw of this.responseChain) {
      res = await mw(res, req, ctx);
    }

    const data = (await parseResponseBody(res)) as T;
    return { data, status: res.status, headers: res.headers };
  }
}

export class HttpClientFactory {
  static createClient(config: HttpClientConfig): ManagedHttpClient {
    // Defaults to false: module-scoped AbortControllers leak across requests
    // in Cloudflare Workers (RefcountedCanceler cross-request I/O errors).
    // Opt in explicitly for client-side use where cross-request abort matters.
    const enableAbortController = config.enableAbortController ?? false;
    let clientAbortController: AbortController | undefined =
      enableAbortController ? new AbortController() : undefined;

    const getClientSignal = () => clientAbortController?.signal;

    // Always append the error-formatting middleware last so consumer
    // middleware can pre-process the response before it gets converted into
    // a thrown NormalizedError on `!res.ok`.
    const responseChain: ResponseMiddleware[] = [
      ...(config.responseMiddleware ?? []),
      createErrorFormattingInterceptor(),
    ];

    const instance: HttpClient = new FetchHttpClient(
      config,
      responseChain,
      getClientSignal
    );

    const managedClient: ManagedHttpClient = {
      instance,
      config,
      abortController: clientAbortController,
    };

    if (enableAbortController) {
      managedClient.resetAbortController = () => {
        clientAbortController = new AbortController();
        managedClient.abortController = clientAbortController;
      };

      managedClient.abortRequests = () => {
        clientAbortController?.abort();
        managedClient.resetAbortController?.();
      };
    }

    return managedClient;
  }
}

// Re-export the auxiliary types so middleware authors only need one import.
export type {
  HttpClient,
  HttpClientConfig,
  HttpResponse,
  ManagedHttpClient,
  RequestBody,
  RequestConfig,
  RequestContext,
  RequestMiddleware,
  ResponseMiddleware,
};
