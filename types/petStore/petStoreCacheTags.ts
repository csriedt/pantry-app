import { PetStatus } from "./petStatus";

/**
 * Server-cache tag builders for the pet store demo.
 *
 * Tags are exact string labels, not hierarchical keys — an invalidation only
 * matches entries that carry that label. The cached action attaches both the
 * family tag and the per-status tag, so either can be targeted:
 *
 *  - `petStoreStatusTag("available")` — surgical: one status
 *  - `PET_STORE_TAGS.family`          — bulk: every status
 *
 * Single source of truth for the strings used by the cached action, the
 * invalidator action, and the webhooks. Do not inline them anywhere else.
 */
export const PET_STORE_TAGS = {
  family: "pets-by-status",
} as const;

export const petStoreStatusTag = (status: PetStatus): string =>
  `${PET_STORE_TAGS.family}-${status}`;
