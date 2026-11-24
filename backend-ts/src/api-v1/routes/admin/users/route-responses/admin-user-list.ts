import { USER_STATES } from "#src/db/schema.js";
import { paginatedResponse } from "#v1/lib/route-responses/pagination.js";
import { z } from "@hono/zod-openapi";

const UtcDateTimeSchema = z.iso.datetime({ precision: 3 });

export const AdminUserOrganizationResponseSchema = z.object({
  orgId: z.string(),
  name: z.string(),
  slug: z.string(),
  isAdmin: z.boolean(),
});
export type AdminUserOrganizationResponse = z.infer<
  typeof AdminUserOrganizationResponseSchema
>;

export const AdminUserListItemResponseSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    email: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().nullable(),
    state: z.enum(USER_STATES),
    loginAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    organization: AdminUserOrganizationResponseSchema.nullable().openapi({
      description:
        "The user's earliest current membership in an active " +
        "organization, or null when they have none.",
    }),
  })
  .openapi("AdminUserListItem");
export type AdminUserListItemResponse = z.infer<
  typeof AdminUserListItemResponseSchema
>;

export const AdminUserStatsResponseSchema = z
  .object({
    totalUsers: z.int().openapi({
      description: "Every user in any state.",
    }),
    totalSiteAdmins: z.int().openapi({
      description: "Users in the SITE_ADMIN state.",
    }),
    totalDeleted: z.int().openapi({
      description: "Users in the DELETED state.",
    }),
  })
  .openapi("AdminUserStats", {
    description: "Site-wide user counts, unaffected by `q` and `state`.",
  });
export type AdminUserStatsResponse = z.infer<
  typeof AdminUserStatsResponseSchema
>;

export const AdminUserListResponseSchema = paginatedResponse(
  AdminUserListItemResponseSchema
).extend({ stats: AdminUserStatsResponseSchema });
export type AdminUserListResponse = z.infer<typeof AdminUserListResponseSchema>;
