import { USER_STATES } from "#src/db/schema.js";
import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import { z } from "@hono/zod-openapi";

export const GetAdminUserListQuerySchema = PaginationQueryRequestSchema.extend({
  q: z
    .string()
    .optional()
    .openapi({
      description:
        "Case-insensitive search. The text is split on whitespace, and " +
        "every word must appear in the username, email, first name or " +
        "last name.",
      example: "jane doe",
    }),
  state: z.enum(USER_STATES).optional().openapi({
    description: "Only users in this state. Omit it to list every state.",
    example: "SITE_ADMIN",
  }),
});
