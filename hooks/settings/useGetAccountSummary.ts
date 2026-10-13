import { getAccountSummaryAction } from "@/actions/settings/getAccountSummaryAction";
import { GetAccountSummaryPayload } from "@/types/settings/getAccountSummaryPayload";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { accountSummaryKey } from "./settingsQueryKeys";

/** The Settings read. Dispatched with `{ params: {} }`. */
export const useGetAccountSummary = (userId: string | null) => {
  const { query, action } = useGenericServerQueryAction<
    Record<string, never>,
    GetAccountSummaryPayload
  >(() => accountSummaryKey(userId), getAccountSummaryAction);

  return [query, action] as const;
};
