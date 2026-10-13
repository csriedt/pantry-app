/**
 * React Query key builders for the settings domain. The summary is
 * session-derived; mutations invalidate it and the request/cancel pair
 * move it.
 */

const SETTINGS = "settings" as const;

export const settingsRoot = (userId: string | null) =>
  [SETTINGS, userId] as const;

export const accountSummaryKey = (userId: string | null) =>
  [SETTINGS, userId, "account-summary"] as const;
