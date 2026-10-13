"use server";

import { updateTag } from "next/cache";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { getSessionUser } from "@/services/supabase/session";
import { RequestAccountDeletionPayload } from "@/types/settings/requestAccountDeletionPayload";
import {
  DELETION_GRACE_DAYS,
} from "@/types/settings/requestAccountDeletionRequest";
import { settingsDataTag } from "@/types/settings/settingsCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";

/**
 * Request account deletion: one `deletion_requests` row with the grace
 * window. The account stays usable and cancellable until it runs; the
 * purge itself is the RTBF branch's job.
 */
export async function requestAccountDeletionAction(): Promise<RequestAccountDeletionPayload> {
  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const user = await getSessionUser(sb);
    if (!user) {
      return { error: { message: "Not signed in.", code: "unauthorized" } };
    }

    const executeAfter = new Date(
      Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: sbError } = await sb.from("deletion_requests").insert({
      user_id: user.id,
      execute_after: executeAfter,
    });
    if (sbError) {
      // A pending request already exists → 409; the UI treats that as
      // "already requested".
      return {
        error: formatSupabaseError(
          sbError,
          "Couldn't request deletion. You may already have one pending.",
        ),
      };
    }

    updateTag(settingsDataTag(user.id));
    return { data: { execute_after: executeAfter } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't request deletion.",
    });
  }
  return { error };
}
