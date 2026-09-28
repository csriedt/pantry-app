import { AuthTokenProvider } from "@/types/service/authTokenProvider";
import { RequestMiddleware } from "@/types/service/httpClientConfig";

/**
 * Creates a request middleware that adds a bearer token to outgoing requests.
 *
 * @param getToken - Function to retrieve the auth token
 * @param headerName - Name of the authorization header (default: 'Authorization')
 * @param tokenPrefix - Prefix for the token value (default: 'Bearer')
 *
 * @example
 * ```ts
 * // Dynamic token from your auth system
 * const authInterceptor = createAuthInterceptor(
 *   async () => {
 *     const { auth } = await import('@clerk/nextjs/server');
 *     return (await auth()).getToken();
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
