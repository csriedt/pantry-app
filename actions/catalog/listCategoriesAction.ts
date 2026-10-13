"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { ListCategoriesPayload } from "@/types/catalog/listCategoriesResponse";
import { mapCategoryRow } from "@/types/catalog/category";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";

/** Every category, ordered for display — read-only for every user. */
export async function listCategoriesAction(): Promise<ListCategoriesPayload> {
  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb
      .from("categories")
      .select("id, slug, label, sort")
      .order("sort", { ascending: true });
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't read the categories."),
      };
    }

    return { data: { categories: (data ?? []).map(mapCategoryRow) } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't read the categories.",
    });
  }
  return { error };
}
