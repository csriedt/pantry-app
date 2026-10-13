"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { GetPantrySnapshotPayload } from "@/types/pantry/getPantrySnapshotPayload";
import {
  GetPantrySnapshotResponseSchema,
} from "@/types/pantry/getPantrySnapshotResponse";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";

/**
 * The dashboard read: version + items + the derived shopping list from one
 * statement. No identity argument — the session cookie carries the JWT and
 * RLS scopes the read; the mapper parses the `Json` envelope into the
 * domain shape.
 */
export async function getPantrySnapshotAction(): Promise<GetPantrySnapshotPayload> {
  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb.rpc("get_pantry_snapshot");
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't read the pantry."),
      };
    }
    return { data: GetPantrySnapshotResponseSchema.parse(data) };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't read the pantry.",
    });
  }
  return { error };
}
