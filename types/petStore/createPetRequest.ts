import { z } from "zod";

import { PetStatusSchema } from "./petStatus";

/**
 * Schema for `createPetAction`'s input. Mirrors the Swagger Petstore
 * `Pet` shape.
 *
 * `.strict()` rejects unknown keys at the boundary — discipline at the
 * edge > "downstream will ignore it." The nested `category` and `tags[]`
 * shapes are also strict for the same reason.
 *
 * `name` and `photoUrls` are required by the Petstore API; everything
 * else is optional and surfaces in the request only when supplied.
 */
export const CreatePetRequestSchema = z
  .object({
    id: z.number().int().optional(),
    name: z.string().min(1),
    category: z
      .object({
        id: z.number().int().optional(),
        name: z.string().optional(),
      })
      .strict()
      .optional(),
    photoUrls: z.array(z.string().min(1)).min(1),
    tags: z
      .array(
        z
          .object({
            id: z.number().int().optional(),
            name: z.string().optional(),
          })
          .strict()
      )
      .optional(),
    status: PetStatusSchema.optional(),
  })
  .strict();

export type CreatePetRequest = z.infer<typeof CreatePetRequestSchema>;
