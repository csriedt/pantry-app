/**
 * React Query key builders for the pantry domain. The snapshot carries
 * items and the list, so one key covers the whole dashboard. The user id
 * comes from the server (server components resolve it from the session);
 * the doorbell version never enters a key.
 */

const PANTRY = "pantry" as const;

export const pantryRoot = (userId: string | null) => [PANTRY, userId] as const;

export const pantrySnapshotKey = (userId: string | null) =>
  [PANTRY, userId, "snapshot"] as const;
