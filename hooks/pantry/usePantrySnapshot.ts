import { getPantrySnapshotAction } from "@/actions/pantry/getPantrySnapshotAction";
import { GetPantrySnapshotPayload } from "@/types/pantry/getPantrySnapshotPayload";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { pantrySnapshotKey } from "./pantryQueryKeys";

/** The dashboard read. Dispatched with `{ params: {} }`. */
export const usePantrySnapshot = (userId: string | null) => {
  const { query, action } = useGenericServerQueryAction<
    Record<string, never>,
    GetPantrySnapshotPayload
  >(() => pantrySnapshotKey(userId), getPantrySnapshotAction);

  return [query, action] as const;
};
