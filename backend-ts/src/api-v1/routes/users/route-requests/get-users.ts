import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import { z } from "@hono/zod-openapi";

export const GetUsersQuerySchema = PaginationQueryRequestSchema.extend({
  q: z.string().optional().openapi({
    description: "Free-text search query.",
    example: "jane doe",
  }),
});
