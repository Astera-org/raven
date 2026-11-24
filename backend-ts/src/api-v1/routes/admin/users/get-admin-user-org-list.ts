import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  requireSiteAdminScope,
  requireSiteAdminScopeResponse,
} from "#v1/routes/admin/middleware/require-site-admin-scope.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { AdminUserParamSchema } from "./route-requests/admin-user-params.js";
import { AdminUserOrgListResponseSchema } from "./route-responses/admin-user-org-list.js";

export const getAdminUserOrgListRoute = createAdminRoute({
  method: "get",
  path: "/users/{id}/orgs",
  tags: ["users"],
  summary: "List a user's organizations",
  description:
    "The user's current memberships in active organizations, earliest " +
    "first by start date, with memberships that have none last.",
  middleware: requireSiteAdminScope,
  request: {
    params: AdminUserParamSchema,
    query: PaginationQueryRequestSchema,
  },
  responses: {
    200: {
      description: "A page of the user's organization memberships.",
      content: {
        "application/json": { schema: AdminUserOrgListResponseSchema },
      },
    },
    ...requireSiteAdminScopeResponse,
    404: {
      description: "No user exists for the given id.",
      content: errorContent("user"),
    },
  },
});

export async function getAdminUserOrgListHandler(
  c: HandlerContext<typeof getAdminUserOrgListRoute, AdminEnv>
): HandlerReturnType<typeof getAdminUserOrgListRoute> {
  const repositories = makeRepositories();
  const { id } = c.req.valid("param");
  if (!(await repositories.users.findForAdmins(id))) {
    return c.json(
      applicationError({ user: { message: "User not found" } }),
      404
    );
  }

  return c.json(
    await repositories.users.listOrgs(id, c.req.valid("query")),
    200
  );
}
