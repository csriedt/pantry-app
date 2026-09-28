import { cacheLife, cacheTag } from "next/cache";

import { ServerCacheOptions } from "@/types/service/payloads";

/**
 * Apply `cacheTag()` and `cacheLife()` inside a `'use cache'` scope from
 * one call site. Centralises the option-to-directive translation so every
 * cached action does it the same way.
 *
 * Call this from inside a `'use cache'` function (top-level after the
 * directive). It cannot be called from outside a cached scope — `cacheTag`
 * and `cacheLife` will throw.
 *
 * Defaults:
 *  - Tags: `defaultTags` is used unless `options.tags` is provided.
 *  - Lifetime:
 *      - `options.revalidate` is a number → `cacheLife({ revalidate })`
 *      - `options.revalidate === false`  → `cacheLife('max')` (rely on tags)
 *      - otherwise                       → `cacheLife('default')`
 */
export const applyCachePolicy = (
  options: ServerCacheOptions | undefined,
  defaultTags: string[]
): void => {
  const tags = options?.tags ?? defaultTags;
  if (tags.length > 0) {
    cacheTag(...tags);
  }

  const revalidate = options?.revalidate;
  if (typeof revalidate === "number") {
    cacheLife({ revalidate });
  } else if (revalidate === false) {
    cacheLife("max");
  } else {
    cacheLife("default");
  }
};
