import { MembershipDateTimeSchema } from "#v1/routes/orgs/schemas.js";
import { z } from "@hono/zod-openapi";

export const AdminPatchOrgMemberBodySchema = z
  .object({
    role: z.enum(["ADMIN", "MEMBER"]).optional(),
    startAt: MembershipDateTimeSchema.nullable().optional(),
    endAt: MembershipDateTimeSchema.nullable().optional(),
  })
  .openapi("AdminUpdateOrgMemberBody");
