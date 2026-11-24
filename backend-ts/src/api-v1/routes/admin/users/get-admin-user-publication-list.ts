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
import { AdminPublicationListResponseSchema } from "#v1/routes/admin/publications/route-responses/admin-publication-list.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { AdminUserParamSchema } from "./route-requests/admin-user-params.js";

export const getAdminUserPublicationListRoute = createAdminRoute({
  method: "get",
  path: "/users/{id}/publications",
  tags: ["users"],
  summary: "List a user's publications",
  description:
    "Publications the user owns or contributes to, newest first, in every " +
    "state, including drafts and removed publications.",
  middleware: requireSiteAdminScope,
  request: {
    params: AdminUserParamSchema,
    query: PaginationQueryRequestSchema,
  },
  responses: {
    200: {
      description: "A page of the user's publications.",
      content: {
        "application/json": { schema: AdminPublicationListResponseSchema },
      },
    },
    ...requireSiteAdminScopeResponse,
    404: {
      description: "No user exists for the given id.",
      content: errorContent("user"),
    },
  },
});

export async function getAdminUserPublicationListHandler(
  c: HandlerContext<typeof getAdminUserPublicationListRoute, AdminEnv>
): HandlerReturnType<typeof getAdminUserPublicationListRoute> {
  const repositories = makeRepositories();
  const { id } = c.req.valid("param");
  if (!(await repositories.users.findForAdmins(id))) {
    return c.json(
      applicationError({ user: { message: "User not found" } }),
      404
    );
  }

  return c.json(
    await repositories.publications.listAdministered({
      scope: c.var.adminScope,
      state: "all",
      userId: id,
      pagination: c.req.valid("query"),
    }),
    200
  );
}
