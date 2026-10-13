"use server";

import { cacheLife, cacheTag } from "next/cache";

import { createBypassSupabaseClient } from "@/services/supabase/bypassSupabaseClient";
import {
  formatSupabaseError,
  isPostgrestError,
} from "@/services/supabase/formatSupabaseError";
import { getSessionUser } from "@/services/supabase/session";
import { GetPantrySnapshotPayload } from "@/types/pantry/getPantrySnapshotPayload";
import { GetPantrySnapshotResponseSchema } from "@/types/pantry/getPantrySnapshotResponse";
import { pantryDataTag } from "@/types/pantry/pantryCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";

/**
 * The dashboard read: version + items + the derived shopping list from one
 * statement. The getter resolves identity from the session; the cached
 * twin below does the trusted read the cache can hold. A write's
 * `updateTag(pantryDataTag(id))` expires this entry (read-your-writes),
 * and the doorbell + version compare cover every other device.
 */
export async function getPantrySnapshotAction(): Promise<GetPantrySnapshotPayload> {
  let error: GenericError | undefined;
  try {
    const user = await getSessionUser();
    if (!user) {
      return { error: { message: "Not signed in.", code: "unauthorized" } };
    }
    return await getPantrySnapshotCached(user.id);
  } catch (ex) {
    error = isPostgrestError(ex)
      ? formatSupabaseError(ex, "Couldn't read the pantry.")
      : formatGenericError(ex, { defaultMessage: "Couldn't read the pantry." });
  }
  return { error };
}

/**
 * The cached read. Unexported on purpose: the user id it takes must come
 * from the session the getter verified, so this function is unreachable
 * from anywhere else — that containment is what makes the trusted call
 * safe (ADR 0001). Its arguments are the cache key; the tag is the
 * invalidation label.
 */
async function getPantrySnapshotCached(
  userId: string,
): Promise<GetPantrySnapshotPayload> {
  "use cache";
  cacheTag(pantryDataTag(userId));
  cacheLife("minutes");

  const sb = createBypassSupabaseClient();
  const { data, error } = await sb.rpc("get_pantry_snapshot_for", {
    p_user_id: userId,
  });
  if (error) throw error;
  return { data: GetPantrySnapshotResponseSchema.parse(data) };
}
