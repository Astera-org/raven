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
import { AdminUserCommentListResponseSchema } from "./route-responses/admin-user-comment-list.js";

export const getAdminUserCommentListRoute = createAdminRoute({
  method: "get",
  path: "/users/{id}/comments",
  tags: ["users"],
  summary: "List a user's comments",
  description:
    "The user's published comments, newest first, each with the publication " +
    "it is on.",
  middleware: requireSiteAdminScope,
  request: {
    params: AdminUserParamSchema,
    query: PaginationQueryRequestSchema,
  },
  responses: {
    200: {
      description: "A page of the user's published comments.",
      content: {
        "application/json": { schema: AdminUserCommentListResponseSchema },
      },
    },
    ...requireSiteAdminScopeResponse,
    404: {
      description: "No user exists for the given id.",
      content: errorContent("user"),
    },
  },
});

export async function getAdminUserCommentListHandler(
  c: HandlerContext<typeof getAdminUserCommentListRoute, AdminEnv>
): HandlerReturnType<typeof getAdminUserCommentListRoute> {
  const repositories = makeRepositories();
  const { id } = c.req.valid("param");
  if (!(await repositories.users.findForAdmins(id))) {
    return c.json(
      applicationError({ user: { message: "User not found" } }),
      404
    );
  }

  return c.json(
    await repositories.users.listComments(id, c.req.valid("query")),
    200
  );
}
