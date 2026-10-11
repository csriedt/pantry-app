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
 * Various auth approaches are shown here:
 * 1. Static API Key - simple from private env
 * 2. Basic Auth - username and password from private env
 * 3. Bearer Token - JWT or session token from fetch then cookies (usually via unauthorized API)
 *
 * For production:
 * - Server Actions: Use the server-side session (this app: the Supabase
 *   session cookie via `createRlsSupabaseClient()`)
 * - API Routes: Same as above
 * - Client Components: Token should come from secure HTTP-only cookies
 */

// Example 1: Static API Key (less likely for FE->BE)
// export function createPetStoreAuthorizedClient() {
//   return HttpClientFactory.createClient({
//     baseURL,
//     timeout: 30000,
//     headers: {
//       'X-API-Key': process.env.PET_STORE_API_KEY || '',
//     },
//   }).instance;
// }

// Example 2: Basic Auth (username:password)
// export function createPetStoreAuthorizedClient() {
//   return HttpClientFactory.createClient({
//     baseURL,
//     timeout: 30000,
//     headers: {
//       Authorization: `Basic ${Buffer.from(
//         `${process.env.PET_STORE_USERNAME || ''}:${process.env.PET_STORE_PASSWORD || ''}`,
//       ).toString('base64')}`,
//     },
//   }).instance;
// }

// Example 3: Bearer Token
// Defaults to the public Swagger Petstore sandbox; override with env.
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
