/**
 * Server-cache tag builders for the settings domain.
 */
export const SETTINGS_TAGS = {
  family: "settings-data",
} as const;

export const settingsDataTag = (userId: string): string =>
  `${SETTINGS_TAGS.family}:${userId}`;
