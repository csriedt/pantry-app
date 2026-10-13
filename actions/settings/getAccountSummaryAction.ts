"use server";

import { formatSupabaseError } from "@/services/supabase/formatSupabaseError";
import { createRlsSupabaseClient } from "@/services/supabase/rlsSupabaseClient";
import { GetAccountSummaryPayload } from "@/types/settings/getAccountSummaryPayload";
import { AccountSummary } from "@/types/settings/accountSummary";
import { GenericError } from "@/types/service/errors";
import { formatGenericError } from "@/lib/service/errors";

/**
 * The Settings read: the session's email, the deletion request's state,
 * and the chef budget (null until the AI branch's aggregate lands — the
 * ledger is server-only and is never exposed row by row).
 */
export async function getAccountSummaryAction(): Promise<GetAccountSummaryPayload> {
  let error: GenericError | undefined;
  try {
    const sb = await createRlsSupabaseClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return { error: { message: "Not signed in.", code: "unauthorized" } };
    }

    const { data: request, error: sbError } = await sb
      .from("deletion_requests")
      .select("execute_after")
      .eq("status", "pending")
      .maybeSingle();
    if (sbError) {
      return {
        error: formatSupabaseError(sbError, "Couldn't read your account."),
      };
    }

    const summary: AccountSummary = {
      email: user.email ?? "",
      chef_budget: null,
      deletion_pending: request !== null,
      deletion_execute_after: request?.execute_after ?? null,
    };
    return { data: summary };
  } catch (ex) {
    error = formatGenericError(ex, {
      defaultMessage: "Couldn't read your account.",
    });
  }
  return { error };
}
