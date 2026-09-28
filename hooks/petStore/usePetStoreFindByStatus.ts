import { petStoreFindByStatusAction } from "@/actions/petStore/petStoreFindByStatusAction";
import { PetStatus } from "@/types/petStore/petStatus";
import { PetStoreFindByStatusListPayload } from "@/types/petStore/petStoreFindByStatusListPayload";
import { useGenericServerQueryAction } from "../service/useGenericServerQueryAction";
import { findByStatusKey } from "./petStoreQueryKeys";

/**
 * Custom React hook to query pets from the pet store by their status.
 *
 * This hook utilizes the `useGenericServerQueryAction` to perform a query action
 * using the provided `petStoreFindByStatusAction`. It returns a tuple containing
 * the query state and the action dispatcher.
 *
 * @returns {[ReturnType<typeof useGenericServerQueryAction>[0], ReturnType<typeof useGenericServerQueryAction>[1]]}
 *   A tuple where the first element is the query state and the second is the action dispatcher.
 *
 * @example
 * const [queryPayload, findByStatusAction] = usePetStoreFindByStatus();
 * findByStatusAction({ params: 'available' });
 */
export const usePetStoreFindByStatus = () => {
  const { query, action } = useGenericServerQueryAction<
    PetStatus,
    PetStoreFindByStatusListPayload
  >(params => findByStatusKey(params), petStoreFindByStatusAction);

  return [query, action] as const;
};
