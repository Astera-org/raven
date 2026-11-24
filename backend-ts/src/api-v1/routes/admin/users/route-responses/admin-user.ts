import { z } from "@hono/zod-openapi";
import { AdminUserListItemResponseSchema } from "./admin-user-list.js";

export const AdminUserResponseSchema = AdminUserListItemResponseSchema.omit({
  organization: true,
})
  .extend({ orcid: z.string().nullable(), emailVerified: z.boolean() })
  .openapi("AdminUser");
export type AdminUserResponse = z.infer<typeof AdminUserResponseSchema>;
