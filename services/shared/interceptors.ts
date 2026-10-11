/**
 * Default request/response middleware for the HTTP transport: bearer-token
 * auth, static headers, and the error-formatting response interceptor.
 */

import { FetchHttpError, formatGenericError } from "@/lib/service/errors";
import {
  AuthTokenProvider,
  RequestMiddleware,
  ResponseMiddleware,
} from "@/types/service/http";

/**
 * Creates a request middleware that adds a bearer token to outgoing requests.
 *
 * @param getToken - Function to retrieve the auth token
 * @param headerName - Name of the authorization header (default: 'Authorization')
 * @param tokenPrefix - Prefix for the token value (default: 'Bearer')
 *
 * @example
 * ```ts
 * // Dynamic token from your auth system — e.g. a Supabase session read
 * // server-side and handed to an upstream that needs its own auth.
 * const authInterceptor = createAuthInterceptor(
 *   async () => {
 *     const { createRlsSupabaseClient } = await import(
 *       "@/services/supabase/rlsSupabaseClient"
 *     );
 *     const sb = await createRlsSupabaseClient();
 *     const { data } = await sb.auth.getSession();
 *     return data.session?.access_token ?? null;
 *   }
 * );
 * ```
 */
export const createAuthInterceptor = (
  getToken: AuthTokenProvider,
  headerName: string = "Authorization",
  tokenPrefix: string = "Bearer"
): RequestMiddleware => {
  return async req => {
    const token = await getToken();
    if (!token) return req;

    const headers = new Headers(req.headers);
    headers.set(headerName, `${tokenPrefix} ${token}`);
    return new Request(req, { headers });
  };
};

/**
 * Creates a request middleware that adds static headers to all requests.
 * Empty / falsy values are skipped so envs like `process.env.MISSING || ''`
 * don't smuggle blank headers through.
 *
 * @example
 * ```ts
 * const headerInterceptor = createHeaderInterceptor({
 *   'X-API-Key': process.env.API_KEY,
 *   'X-Client-Version': '1.0.0',
 * });
 * ```
 */
export const createHeaderInterceptor = (
  headers: Record<string, string>
): RequestMiddleware => {
  return req => {
    const merged = new Headers(req.headers);
    for (const [k, v] of Object.entries(headers)) {
      if (v) merged.set(k, v);
    }
    return new Request(req, { headers: merged });
  };
};

/**
 * Best-effort body parser for error responses. JSON is preferred; falls back
 * to text. Failures (truncated body, invalid JSON) return `undefined` rather
 * than throwing — we never want the error path itself to throw.
 *
 * The response is cloned so that other middleware (or callers, in non-error
 * paths) can still read the body.
 */
const safeParseErrorBody = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return await res.clone().json();
    }
    return await res.clone().text();
  } catch {
    return undefined;
  }
};

/**
 * Creates the response middleware that turns `!res.ok` into a thrown,
 * fully-normalised error.
 *
 * The factory always appends this as the last entry of the response chain
 * (after consumer middleware), so other middleware can pre-process the
 * response before we convert it into an error.
 *
 * The thrown value is a {@link NormalizedError} from `formatGenericError`,
 * not the raw {@link FetchHttpError}. Per-call `errorConfig` is read from
 * the per-request context; the factory has already merged client defaults
 * into that field.
 */
export const createErrorFormattingInterceptor = (): ResponseMiddleware => {
  return async (res, req, ctx) => {
    if (res.ok) return res;

    const body = await safeParseErrorBody(res);
    const fetchError = new FetchHttpError({
      status: res.status,
      url: req.url,
      method: req.method,
      body,
    });

    throw formatGenericError(fetchError, ctx.errorConfig);
  };
};
