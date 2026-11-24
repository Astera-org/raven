import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { noContentResponse } from "#v1/lib/route-responses/no-content.js";
import {
  type AdminEnv,
  isOrgInAdminScope,
} from "#v1/routes/admin/middleware/require-admin-scope.js";
import { OrgIdOrSlugAndMemberParamsSchema } from "#v1/routes/orgs/schemas.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";

// ---------------------------------------------------------------------------
// DELETE /orgs/{idOrSlug}/members/{memberId} — remove a member
// ---------------------------------------------------------------------------

export const deleteAdminOrgMemberRoute = createAdminRoute({
  method: "delete",
  path: "/orgs/{idOrSlug}/members/{memberId}",
  tags: ["orgs"],
  summary: "Remove a member from an organization",
  description:
    "Collapses v0's separate `remove_member` (deactivate) and " +
    "`delete_member` (hard delete) actions into a single, standard DELETE: " +
    "this always removes the membership record entirely, whether or not " +
    "it has ended.",
  request: { params: OrgIdOrSlugAndMemberParamsSchema },
  responses: {
    204: { description: "The member was removed." },
    403: {
      description: "The caller does not administer this organization.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No organization exists for the given id or slug, or the user is not a member.",
      content: errorContent("org", "member"),
    },
  },
});

export async function deleteAdminOrgMemberHandler(
  c: HandlerContext<typeof deleteAdminOrgMemberRoute, AdminEnv>
): HandlerReturnType<typeof deleteAdminOrgMemberRoute> {
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

  if (!(await repositories.orgs.findMember(orgId, memberId))) {
    return c.json(
      applicationError({ member: { message: "Member not found" } }),
      404
    );
  }

  await repositories.orgs.deleteMember(orgId, memberId);
  return noContentResponse(c);
}
