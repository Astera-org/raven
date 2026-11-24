import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  requireSiteAdminScope,
  requireSiteAdminScopeResponse,
} from "#v1/routes/admin/middleware/require-site-admin-scope.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { GetAdminUserListQuerySchema } from "./route-requests/get-admin-user-list.js";
import { AdminUserListResponseSchema } from "./route-responses/admin-user-list.js";

export const getAdminUserListRoute = createAdminRoute({
  method: "get",
  path: "/users",
  tags: ["users"],
  summary: "List users",
  description:
    "Site-admin view of every user, newest first, in every state unless " +
    "`state` narrows it. Each user's `organization` is their earliest " +
    "current membership in an active organization. `pagination.total` " +
    "counts the filtered list; `stats` counts every user, ignoring `q` " +
    "and `state`.",
  middleware: requireSiteAdminScope,
  request: { query: GetAdminUserListQuerySchema },
  responses: {
    200: {
      description: "A page of users matching `q` and `state`.",
      content: {
        "application/json": { schema: AdminUserListResponseSchema },
      },
    },
    ...requireSiteAdminScopeResponse,
  },
});

export async function getAdminUserListHandler(
  c: HandlerContext<typeof getAdminUserListRoute, AdminEnv>
): HandlerReturnType<typeof getAdminUserListRoute> {
  const { state, q, ...pagination } = c.req.valid("query");
  return c.json(
    await makeRepositories().users.listForAdmins({
      state,
      searchTerm: q?.trim(),
      pagination,
    }),
    200
  );
}
