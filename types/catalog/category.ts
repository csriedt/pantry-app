import { z } from "zod";

/** A category as the service layer exposes it — the grouping key's label. */
export const CategorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  label: z.string().min(1),
  sort: z.number(),
});

export type Category = z.infer<typeof CategorySchema>;

/** Parse one wire row from a `categories` select. */
export function mapCategoryRow(row: unknown): Category {
  return CategorySchema.parse(row);
}
