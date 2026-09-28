import { RequestMiddleware } from "@/types/service/httpClientConfig";

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
