import "server-only";

import { createAuthInterceptor } from "../shared/interceptors";
import { HttpClientFactory } from "../shared/client";

/**
 * Pet Store Authorized Client factory.
 *
 * Returns a fresh HttpClient per call — do not cache the returned instance
 * at module scope in consumer code. Cloudflare Workers isolate I/O objects
 * per-request; a shared module-scoped instance can leak I/O references
 * (streams, AbortSignals) across requests and throw `RefcountedCanceler`
 * cross-request errors.
 *
 * The interceptor below sends a bearer token. A static API key or basic auth
 * would swap the header in the same place; bearer is shown because it is the
 * shape a server-side session produces.
 *
 * For production:
 * - Server Actions: Use the server-side session (this app: the Supabase
 *   session cookie via `createRlsSupabaseClient()`)
 * - API Routes: Same as above
 * - Client Components: Token should come from secure HTTP-only cookies
 */

// Bearer token from env, falling back to the public sandbox.
const baseURL =
  process.env.NEXT_PUBLIC_PET_STORE_BASE_URL ?? "https://petstore.swagger.io/v2";

export function createPetStoreAuthorizedClient() {
  return HttpClientFactory.createClient({
    baseURL: baseURL!,
    timeout: 30000,
    requestMiddleware: [
      createAuthInterceptor(async () => {
        // A bearer token for an upstream that needs its own auth comes
        // from this app's own session — e.g. the Supabase access token,
        // read server-side. For this example, a token from env.
        return process.env.PET_STORE_BEARER_TOKEN || null;
      }),
    ],
  }).instance;
}
