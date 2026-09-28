import { ServerCacheOptions } from "./serverCacheOptions";

export interface GenericServerCachedRequest<T> {
  params: T;
  cacheOptions?: ServerCacheOptions;
}
