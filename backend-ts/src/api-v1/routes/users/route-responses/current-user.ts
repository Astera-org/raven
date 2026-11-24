import { z } from "@hono/zod-openapi";

export const CurrentUserResponseSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().nullable(),
    state: z.string(),
    isOrgAdmin: z.boolean().openapi({
      description:
        "Whether the admin routes scope the caller to the organizations " +
        "they administer: an ACTIVE user with a current ADMIN membership in " +
        "at least one. False for site admins, whose access is unscoped.",
    }),
  })
  .openapi("CurrentUser");
