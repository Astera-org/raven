import { z } from "@hono/zod-openapi";

/** `page`/`perPage` are parsed leniently by `getPagination` (invalid or
 * out-of-range values clamp rather than 422), so the query schema only
 * documents shape, it doesn't re-validate numeric ranges. */
export const PaginationQueryRequestSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .optional()
    .openapi({ default: "1", example: "1" }),
  perPage: z.coerce.number().int().optional().openapi({
    default: "20",
    example: "20",
    description: "Number of items per page",
  }),
});
export type PaginationQueryRequest = z.infer<
  typeof PaginationQueryRequestSchema
>;
