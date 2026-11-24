import { z } from "@hono/zod-openapi";

export const PublishedVersionResponseSchema = z.object({
  publicationId: z.string(),
  slug: z.string(),
  versionNumber: z.int(),
  state: z.literal("PUBLISHED"),
  doi: z.string().nullable(),
  versionDoi: z.string().nullable(),
});

export type PublishedVersionResponse = z.infer<
  typeof PublishedVersionResponseSchema
>;
