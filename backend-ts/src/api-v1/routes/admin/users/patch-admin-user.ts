import { type UserUpdate } from "#src/db/schema.js";
import { isDuplicateEntryError } from "#src/lib/utils/db-errors.js";
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
import { AdminUpdateUserBodySchema } from "./route-requests/patch-admin-user.js";
import { AdminUserResponseSchema } from "./route-responses/admin-user.js";

export const patchAdminUserRoute = createAdminRoute({
  method: "patch",
  path: "/users/{id}",
  tags: ["users"],
  summary: "Update a user",
  description:
    "Partial update: a field omitted from the body is left untouched. " +
    "`orcid` may be set to `null` to clear it. Changing `email` leaves " +
    "`emailVerified` as it was unless the body also sets it.",
  middleware: requireSiteAdminScope,
  request: {
    params: AdminUserParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: AdminUpdateUserBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The patch was applied.",
      content: { "application/json": { schema: AdminUserResponseSchema } },
    },
    ...requireSiteAdminScopeResponse,
    404: {
      description: "No user exists for the given id.",
      content: errorContent("user"),
    },
    409: {
      description: "Another user already has this email.",
      content: errorContent("email"),
    },
  },
});

export async function patchAdminUserHandler(
  c: HandlerContext<typeof patchAdminUserRoute, AdminEnv>
): HandlerReturnType<typeof patchAdminUserRoute> {
  const repositories = makeRepositories();
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const updates: UserUpdate = {};
  if (body.email !== undefined) updates.email = body.email;
  if (body.orcid !== undefined) updates.orcid = body.orcid;
  if (body.emailVerified !== undefined)
    updates.emailVerified = body.emailVerified;

  try {
    await repositories.users.update(id, updates);
  } catch (error) {
    if (isDuplicateEntryError(error, "users_email_unique")) {
      return c.json(
        applicationError({
          email: { message: "A user with this email already exists" },
        }),
        409
      );
    }
    throw error;
  }

  // Updating an unknown id matches no row, so the 404 comes from this read.
  const user = await repositories.users.findForAdmins(id);
  if (!user) {
    return c.json(
      applicationError({ user: { message: "User not found" } }),
      404
    );
  }

  return c.json(user, 200);
}
