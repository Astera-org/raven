import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import { resolveAdminScope } from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { CurrentUserResponseSchema } from "./route-responses/current-user.js";

export const getCurrentUserRoute = createAuthedRoute({
  method: "get",
  path: "/me",
  tags: ["users"],
  summary: "Get the current user",
  description:
    "The signed-in caller's profile and admin standing. Replaces v0's " +
    "`GET /auth/me`.",
  responses: {
    200: {
      description: "The current user.",
      content: {
        "application/json": {
          schema: CurrentUserResponseSchema,
        },
      },
    },
  },
});

export async function getCurrentUserHandler(
  c: HandlerContext<typeof getCurrentUserRoute>
): HandlerReturnType<typeof getCurrentUserRoute> {
  const user = c.var.user;
  const adminScope = await resolveAdminScope(makeRepositories(), user.id);
  return c.json(
    {
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.image ?? null,
      state: user.state,
      isOrgAdmin: adminScope?.kind === "org",
    },
    200
  );
}
