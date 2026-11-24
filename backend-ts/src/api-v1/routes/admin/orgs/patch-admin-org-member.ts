import { dateToIso8601 } from "#src/lib/dates.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import {
  type AdminEnv,
  isOrgInAdminScope,
} from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  isMembershipStartAfterEnd,
  MEMBERSHIP_DATES_MESSAGE,
  OrgIdOrSlugAndMemberParamsSchema,
} from "#v1/routes/orgs/schemas.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { AdminPatchOrgMemberBodySchema } from "./route-requests/patch-member.js";
import { AdminOrgMemberResponseSchema } from "./route-responses/orgs.js";

// ---------------------------------------------------------------------------
// PATCH /{idOrSlug}/members/{memberId} — modify member details
// ---------------------------------------------------------------------------

export const patchAdminOrgMemberRoute = createAdminRoute({
  method: "patch",
  path: "/orgs/{idOrSlug}/members/{memberId}",
  tags: ["orgs"],
  summary: "Update an organization's member",
  request: {
    params: OrgIdOrSlugAndMemberParamsSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: AdminPatchOrgMemberBodySchema },
      },
    },
  },
  responses: {
    200: {
      description:
        "The organization's active members. Unlike v0, an organization " +
        "with no members returns an empty list rather than 404.",
      content: {
        "application/json": {
          schema: AdminOrgMemberResponseSchema,
        },
      },
    },
    403: {
      description: "User is not authorized to edit this organization.",
      content: errorContent("auth"),
    },
    404: {
      description: "No organization exists for the given id or slug.",
      content: errorContent("org", "member"),
    },
  },
});

export async function patchAdminOrgMemberHandler(
  c: HandlerContext<typeof patchAdminOrgMemberRoute, AdminEnv>
): HandlerReturnType<typeof patchAdminOrgMemberRoute> {
  const repositories = makeRepositories();
  const { idOrSlug, memberId } = c.req.valid("param");
  const org = await repositories.orgs.findOrgByIdentifier(idOrSlug);
  if (!org) {
    return c.json(
      applicationError({ org: { message: "Organization not found" } }),
      404
    );
  }
  const orgId = org.id;

  if (!isOrgInAdminScope(c.var.adminScope, orgId)) {
    return c.json(
      applicationError({ auth: { message: "Not authorized to access org" } }),
      403
    );
  }

  const memberNotFound = applicationError({
    member: { message: "Member not found" },
  });
  // Matches ended memberships too, so they can be edited, e.g. reactivated.
  const existing = await repositories.orgs.findMember(orgId, memberId);
  if (!existing) return c.json(memberNotFound, 404);

  const body = c.req.valid("json");
  // A PATCH can set either date alone, so check it against the stored other.
  // Patches that change no date skip the check, so a membership whose stored
  // dates are already out of order can still have its role changed.
  const changesDates = body.startAt !== undefined || body.endAt !== undefined;
  if (
    changesDates &&
    isMembershipStartAfterEnd(
      body.startAt === undefined ? existing.startAt : body.startAt,
      body.endAt === undefined ? existing.endAt : body.endAt
    )
  ) {
    return c.var.validationErrors([
      { code: "custom", path: ["endAt"], message: MEMBERSHIP_DATES_MESSAGE },
    ]);
  }
  // Only fields present in the body are updated; an empty body is a no-op.
  const updates: Partial<{
    roles: ["ADMIN"] | null;
    startAt: string | null;
    endAt: string | null;
  }> = {};
  if (body.role !== undefined) {
    updates.roles = body.role === "ADMIN" ? ["ADMIN"] : null;
  }
  if (body.startAt !== undefined) updates.startAt = body.startAt;
  if (body.endAt !== undefined) updates.endAt = body.endAt;

  await repositories.orgs.updateMember(orgId, memberId, updates);

  // The membership can have been deleted by a concurrent request since the
  // check above.
  const member = await repositories.orgs.findMember(orgId, memberId);
  if (!member) return c.json(memberNotFound, 404);

  return c.json(
    {
      userId: member.id,
      username: member.username,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      avatar: member.image,
      orcid: member.orcid,
      isAdmin: (member.roles ?? []).includes("ADMIN"),
      startAt: dateToIso8601(member.startAt),
      endAt: dateToIso8601(member.endAt),
      state: member.state,
      createdAt: member.createdAt,
      canCreatePublications: null,
      role: member.roles?.[0] ?? ("MEMBER" as const),
    },
    200
  );
}
