import { USER_STATES } from "#src/db/schema.js";
import {
  extendedPaginatedResponse,
  paginatedResponse,
} from "#v1/lib/route-responses/pagination.js";
import { OrgMemberResponseSchema } from "#v1/routes/orgs/schemas.js";
import { z } from "@hono/zod-openapi";

const UtcDateTimeSchema = z.iso.datetime({ precision: 3 });

export const AdminOrgResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    avatar: z.string().nullable(),
    profile: z.string().nullable(),
    rorId: z.string().nullable(),
    unlisted: z.boolean().nullable(),
    createdAt: UtcDateTimeSchema.nullable(),
    updatedAt: UtcDateTimeSchema.nullable(),
    currentMemberCount: z.int().openapi({
      description: "Members whose membership has not ended.",
    }),
    totalMemberCount: z.int().openapi({
      description: "All members, including those whose membership has ended.",
    }),
    publishedPublicationCount: z.int().openapi({
      description: "Publications in the PUBLISHED state.",
    }),
    totalPublicationCount: z.int().openapi({
      description: "All publications, including drafts and removed ones.",
    }),
    doiMintingEnabled: z.boolean().nullable(),
    doiPrefix: z.string().nullable(),
    canEdit: z.boolean().optional(),
  })
  .openapi("AdminOrganization");
export type AdminOrgResponse = z.infer<typeof AdminOrgResponseSchema>;

export const AdminOrgListItemResponseSchema = AdminOrgResponseSchema.omit({
  canEdit: true,
}).openapi("AdminOrganizationListItem");
export type AdminOrgListItemResponse = z.infer<
  typeof AdminOrgListItemResponseSchema
>;

export const AdminOrgListResponseSchema = extendedPaginatedResponse(
  AdminOrgListItemResponseSchema,
  // @todo move totalUnlisted to `stats` (see "List envelope" in the
  // api-versioning skill).
  { totalUnlisted: z.int() }
);
export type AdminOrgListResponse = z.infer<typeof AdminOrgListResponseSchema>;

export const AdminOrgMemberResponseSchema = z
  .object({
    userId: z.string(),
    username: z.string(),
    email: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().nullable(),
    orcid: z.string().nullable(),
    isAdmin: z.boolean(),
    startAt: UtcDateTimeSchema.nullable(),
    endAt: UtcDateTimeSchema.nullable(),
    state: z.enum(USER_STATES),
    createdAt: UtcDateTimeSchema.nullable(),
    canCreatePublications: z.boolean().nullable(),
    role: z.enum(["ADMIN", "MEMBER"]),
  })
  .openapi("AdminOrgMember");
export type AdminOrgMemberResponse = z.infer<
  typeof AdminOrgMemberResponseSchema
>;

export const AdminAddOrgMemberResponseSchema = OrgMemberResponseSchema.pick({
  userId: true,
  username: true,
  isAdmin: true,
  startAt: true,
  endAt: true,
}).openapi("AdminAddOrgMemberResponse");

export const AdminOrgMembersListResponseSchema = paginatedResponse(
  AdminOrgMemberResponseSchema
);
export type AdminOrgMembersListResponse = z.infer<
  typeof AdminOrgMembersListResponseSchema
>;
