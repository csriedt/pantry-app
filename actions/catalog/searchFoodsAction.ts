"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { SearchFoodsPayload } from "@/types/catalog/searchFoodsPayload";
import {
  SearchFoodsRequest,
  SearchFoodsRequestSchema,
} from "@/types/catalog/searchFoodsRequest";
import { mapFoodRow } from "@/types/catalog/food";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";
import { ilikePattern } from "@/lib/service/paging";
import { validateInput } from "@/lib/service/validation";

/**
 * The quick-add type-ahead over `foods`: globals plus the caller's own
 * rows, own rows first. Reads through RLS, so another user's rows are
 * invisible by construction.
 *
 * Deliberately uncached, and deliberately single-function: the result mixes
 * stable globals with rows that change on every create-on-miss, so a cache
 * would have poor hit rates and visible staleness on the very gesture that
 * uses it. If that ever changes, the shape is a `search_foods_for(
 * p_user_id, pattern)` RPC behind a `searchFoodsCached` worker — an
 * `{ error }` return inside a `'use cache'` scope would be cached.
 */
export async function searchFoodsAction(
  input: SearchFoodsRequest,
): Promise<SearchFoodsPayload> {
  const validation = validateInput(SearchFoodsRequestSchema, input);
  if (!validation.success) return { error: validation.error };

  const pattern = ilikePattern(validation.data.query);

  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb
      .from("foods")
      .select("id, canonical_name, category_id, scope")
      .or(
        `canonical_name.ilike.${pattern},normalized_name.ilike.${pattern}`,
      )
      // 'user' sorts above 'global', so own rows rank first.
      .order("scope", { ascending: false })
      .order("canonical_name", { ascending: true })
      .limit(validation.data.limit);
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't search the catalog."),
      };
    }

    return { data: { foods: (data ?? []).map(mapFoodRow) } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't search the catalog.",
    });
  }
  return { error };
}
