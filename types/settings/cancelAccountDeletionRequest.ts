/** The RPC is idempotent: cancelling with nothing pending reports false. */
export type CancelAccountDeletionResponse = {
  cancelled: boolean;
};
