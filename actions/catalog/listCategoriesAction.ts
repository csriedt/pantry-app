"use server";

import { cacheLife, cacheTag } from "next/cache";

import { createBypassSupabaseClient } from "@/services/supabase/bypassSupabaseClient";
import {
  formatSupabaseError,
  isPostgrestError,
} from "@/services/supabase/formatSupabaseError";
import { ListCategoriesPayload } from "@/types/catalog/listCategoriesResponse";
import { mapCategoryRow } from "@/types/catalog/category";
import { CATALOG_TAGS } from "@/types/catalog/catalogCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";

/**
 * Every category, ordered for display — read-only for every user, so this
 * is global reference data: cached through the trusted client with no
 * identity anywhere in the key or the read. Tags are for operator-side
 * invalidation when categories are ever edited (nothing in the app edits
 * them); `cacheLife` is the safety net.
 */
export async function listCategoriesAction(): Promise<ListCategoriesPayload> {
  let error: GenericError | undefined;
  try {
    return await listCategoriesCached();
  } catch (ex) {
    error = isPostgrestError(ex)
      ? formatSupabaseError(ex, "Couldn't read the categories.")
      : formatGenericError(ex, {
          defaultMessage: "Couldn't read the categories.",
        });
  }
  return { error };
}

async function listCategoriesCached(): Promise<ListCategoriesPayload> {
  "use cache";
  cacheTag(CATALOG_TAGS.categories);
  cacheLife("hours");

  const sb = createBypassSupabaseClient();
  const { data, error } = await sb
    .from("categories")
    .select("id, slug, label, sort")
    .order("sort", { ascending: true });
  if (error) throw error;

  return { data: { categories: (data ?? []).map(mapCategoryRow) } };
}
