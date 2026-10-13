"use server";

import { updateTag } from "next/cache";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { CancelAccountDeletionPayload } from "@/types/settings/cancelAccountDeletionPayload";
import { settingsDataTag } from "@/types/settings/settingsCacheTags";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";

/**
 * Cancel a pending deletion request — the one definer RPC (the user
 * matrix grants no UPDATE on `deletion_requests`; the function does its
 * own ownership check). Idempotent: nothing pending reports false.
 */
export async function cancelAccountDeletionAction(): Promise<CancelAccountDeletionPayload> {
  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const { data, error: sbError } = await sb.rpc("cancel_deletion_request");
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't cancel the request."),
      };
    }

    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) {
      updateTag(settingsDataTag(user.id));
    }

    return { data: { cancelled: Boolean(data) } };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't cancel the request.",
    });
  }
  return { error };
}
