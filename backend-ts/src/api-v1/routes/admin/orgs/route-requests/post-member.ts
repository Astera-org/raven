import {
  isMembershipStartAfterEnd,
  MEMBERSHIP_DATES_MESSAGE,
  MembershipDateTimeSchema,
} from "#v1/routes/orgs/schemas.js";
import { z } from "@hono/zod-openapi";

export const AdminAddOrgMemberBodySchema = z
  .object({
    username: z.string().trim().min(1, "username is required"),
    startAt: MembershipDateTimeSchema.nullable().optional(),
    endAt: MembershipDateTimeSchema.nullable().optional(),
    isAdmin: z.boolean().optional().default(false),
  })
  .refine((body) => !isMembershipStartAfterEnd(body.startAt, body.endAt), {
    path: ["endAt"],
    message: MEMBERSHIP_DATES_MESSAGE,
  })
  .openapi("AdminAddOrgMemberBody");
