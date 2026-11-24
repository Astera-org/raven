import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
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
import { AdminUserResponseSchema } from "./route-responses/admin-user.js";

export const getAdminUserRoute = createAdminRoute({
  method: "get",
  path: "/users/{id}",
  tags: ["users"],
  summary: "Get a user",
  description: "Site-admin view of one user's profile, in any state.",
  middleware: requireSiteAdminScope,
  request: { params: AdminUserParamSchema },
  responses: {
    200: {
      description: "The user.",
      content: { "application/json": { schema: AdminUserResponseSchema } },
    },
    ...requireSiteAdminScopeResponse,
    404: {
      description: "No user exists for the given id.",
      content: errorContent("user"),
    },
  },
});

export async function getAdminUserHandler(
  c: HandlerContext<typeof getAdminUserRoute, AdminEnv>
): HandlerReturnType<typeof getAdminUserRoute> {
  const { id } = c.req.valid("param");
  const user = await makeRepositories().users.findForAdmins(id);
  if (!user) {
    return c.json(
      applicationError({ user: { message: "User not found" } }),
      404
    );
  }

  return c.json(user, 200);
}
