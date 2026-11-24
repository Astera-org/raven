import { paginatedResponse } from "#v1/lib/route-responses/pagination.js";
import { z } from "@hono/zod-openapi";
import { AdminUserOrganizationResponseSchema } from "./admin-user-list.js";

const UtcDateTimeSchema = z.iso.datetime({ precision: 3 });

export const AdminUserOrgResponseSchema =
  AdminUserOrganizationResponseSchema.extend({
    startAt: UtcDateTimeSchema.nullable(),
  }).openapi("AdminUserOrg");
export type AdminUserOrgResponse = z.infer<typeof AdminUserOrgResponseSchema>;

export const AdminUserOrgListResponseSchema = paginatedResponse(
  AdminUserOrgResponseSchema
);
export type AdminUserOrgListResponse = z.infer<
  typeof AdminUserOrgListResponseSchema
>;
