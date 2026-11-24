import { dateToIso8601 } from "#src/lib/dates.js";
import { getPagination } from "#src/lib/utils/get-pagination.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import {
  type AdminEnv,
  isOrgInAdminScope,
} from "#v1/routes/admin/middleware/require-admin-scope.js";
import { OrgIdOrSlugParamSchema } from "#v1/routes/orgs/schemas.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { AdminOrgMembersListResponseSchema } from "./route-responses/orgs.js";

// ---------------------------------------------------------------------------
// GET /{idOrSlug}/members — list members
// ---------------------------------------------------------------------------

export const getAdminListMembersRoute = createAdminRoute({
  method: "get",
  path: "/orgs/{idOrSlug}/members",
  tags: ["orgs"],
  summary: "List an organization's members",
  request: {
    params: OrgIdOrSlugParamSchema,
    query: PaginationQueryRequestSchema,
  },
  responses: {
    200: {
      description:
        "The organization's members, including those whose membership " +
        "has ended. Unlike v0, an organization with no members returns " +
        "an empty list rather than 404.",
      content: {
        "application/json": {
          schema: AdminOrgMembersListResponseSchema,
        },
      },
    },
    403: {
      description: "The caller does not administer this organization.",
      content: errorContent("auth"),
    },
    404: {
      description: "No organization exists for the given id or slug.",
      content: errorContent("org"),
    },
  },
});

export async function getAdminListMembersHandler(
  c: HandlerContext<typeof getAdminListMembersRoute, AdminEnv>
): HandlerReturnType<typeof getAdminListMembersRoute> {
  const repositories = makeRepositories();
  const { idOrSlug } = c.req.valid("param");
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

  const query = c.req.valid("query");
  const { page, perPage, offset } = getPagination(query);

  const [rows, total] = await Promise.all([
    repositories.orgs.listMembersForAdmins(orgId, perPage, offset),
    repositories.orgs.countMembers(orgId),
  ]);

  const items = rows.map((row) => ({
    userId: row.id,
    username: row.username,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    avatar: row.image,
    orcid: row.orcid,
    isAdmin: (row.roles ?? []).includes("ADMIN"),
    startAt: dateToIso8601(row.startAt),
    endAt: dateToIso8601(row.endAt),
    state: row.state,
    createdAt: row.createdAt,
    canCreatePublications: null,
    role: row.roles?.[0] ?? ("MEMBER" as const),
  }));

  return c.json(
    {
      items,
      pagination: { total, page, perPage },
    },
    200
  );
}
