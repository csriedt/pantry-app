/// TODO: re-enable this if server-side cache on Cloudflare via OpenNext is resolved or hosting moves to Vercel. See https://github.com/vercel/next.js/issues/94880, https://github.com/better-auth/better-auth/issues/10103, https://github.com/opennextjs/opennextjs-cloudflare/issues/1062 for related cache issues currently present in Next/OpenNext in this context.

// "use server";

// import { PetStatus, PetStatusSchema } from "@/types/petStore/petStatus";
// import { PetStoreFindByStatusCachedListPayload } from "@/types/petStore/petStoreFindByStatusCachedListPayload";
// import { GenericServerCachedRequest } from "@/types/service/genericServerCachedRequest";
// import { ServerCacheOptions } from "@/types/service/serverCacheOptions";
// import { applyCachePolicy } from "@/lib/service/applyCachePolicy";
// import { validateInput } from "@/lib/service/validateInput";

// import { petStoreFindByStatusAction } from "./petStoreFindByStatusAction";

// /**
//  * Inner cached function. Only reached after the outer action has validated
//  * its input, so validation errors are never cached. `cachedAt` is stamped
//  * before return so it's part of the cached value — frozen on hits.
//  */
// async function fetchCachedPetsByStatus(
//   status: PetStatus,
//   cacheOptions?: ServerCacheOptions
// ): Promise<PetStoreFindByStatusCachedListPayload> {
//   "use cache";
//   applyCachePolicy(cacheOptions, [
//     "pets-by-status",
//     `pets-by-status-${status}`,
//   ]);

//   const result = await petStoreFindByStatusAction(status);
//   return { ...result, cachedAt: new Date().toISOString() };
// }

// /**
//  * Cached server action for fetching pets by status. Validation runs fresh
//  * every call; caching only kicks in once `status` is known good.
//  *
//  * Invalidation: see `invalidatePetsByStatusAction`
//  * (`updateTag` / `revalidateTag` on `pets-by-status` or
//  * `pets-by-status-<status>`).
//  */
// export async function petStoreFindByStatusCachedAction(
//   request: GenericServerCachedRequest<PetStatus>
// ): Promise<PetStoreFindByStatusCachedListPayload> {
//   const validation = validateInput(PetStatusSchema, request.params);
//   if (!validation.success) return { error: validation.error };
//   return fetchCachedPetsByStatus(validation.data, request.cacheOptions);
// }
