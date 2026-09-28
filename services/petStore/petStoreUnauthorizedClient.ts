import { HttpClientFactory } from "../shared/client";

/**
 * Simple unauthorized client factory for the Pet Store API.
 *
 * Returns a fresh HttpClient per call — do not cache the returned instance
 * at module scope in consumer code. Cloudflare Workers isolate I/O objects
 * per-request; a shared module-scoped instance can leak I/O references
 * (streams, AbortSignals) across requests and throw `RefcountedCanceler`
 * cross-request errors.
 *
 * Used for public endpoints, and for fetching tokens for the authorized
 * client (typically).
 */
const baseURL = process.env.NEXT_PUBLIC_PET_STORE_BASE_URL;
if (!baseURL) {
  throw new Error("Missing NEXT_PUBLIC_PET_STORE_BASE_URL in the environment.");
}

export function createPetStoreUnauthorizedClient() {
  return HttpClientFactory.createClient({
    baseURL: baseURL!,
    timeout: 30000,
  }).instance;
}
