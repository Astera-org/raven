import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import { z } from "@hono/zod-openapi";

export const GetPublicationsQuerySchema = PaginationQueryRequestSchema.extend({
  q: z
    .string()
    .optional()
    .openapi({
      description:
        "Full-text search term, matched against title, abstract, body, " +
        "and contributor names.",
      example: "gene editing",
    }),
  tag: z.string().optional().openapi({
    description: "Filter to publications tagged with this exact tag.",
    example: "genomics",
  }),
});
export type GetPublicationsQuery = z.infer<typeof GetPublicationsQuerySchema>;
