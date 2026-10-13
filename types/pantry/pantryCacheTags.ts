/**
 * Server-cache tag builders for the pantry domain. One doorbell, one
 * family: the whole dashboard read (items + list) hangs off
 * `pantry-data:<userId>`, so any write invalidates the whole family.
 *
 * Single source of truth for the tag strings — the write actions and the
 * (future) cached read import these; never inline them.
 */
export const PANTRY_TAGS = {
  family: "pantry-data",
} as const;

export const pantryDataTag = (userId: string): string =>
  `${PANTRY_TAGS.family}:${userId}`;
