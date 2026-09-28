import { createPetAction } from "@/actions/petStore/createPet";
import { CreatePetPayload } from "@/types/petStore/createPetPayload";
import { CreatePetRequest } from "@/types/petStore/createPetRequest";
import { useGenericServerMutateAction } from "../service/useGenericServerMutateAction";
import { findByStatusRoot } from "./petStoreQueryKeys";

/**
 * Custom hook to create a new pet using the internal server mutate action.
 *
 * This hook provides both synchronous (`mutate`) and asynchronous (`mutateAsync`) mutation functions as well as loading indicator
 * for creating a pet. It uses the `createPetAction` to perform the mutation and is configured to
 * invalidate the 'find-by-status' query upon success.
 *
 * @returns {[mutate: (variables: CreatePetRequest) => void, mutateAsync: (variables: CreatePetRequest) => Promise<CreatePetPayload>]}
 *   A tuple containing:
 *   - `mutate`: Function to trigger the mutation synchronously.
 *   - `mutateAsync`: Function to trigger the mutation asynchronously and return a promise.
 *
 * @example
 * const [createPet, createPetAsync, isCreatingPet] = useCreatePet();
 * createPet({ name: 'Fluffy', status: 'available' });
 * // or
 * await createPetAsync({ name: 'Fluffy', status: 'available' });
 */
export const useCreatePet = () => {
  const { mutate, mutateAsync, isPending } = useGenericServerMutateAction<
    CreatePetRequest,
    CreatePetPayload
  >(["create-pet"], [findByStatusRoot()], createPetAction);

  return [mutate, mutateAsync, isPending] as const;
};
