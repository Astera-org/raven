import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { createMiddleware } from "hono/factory";
import { type AdminEnv } from "./require-admin-scope.js";

export const requireSiteAdminScopeResponse = {
  403: {
    description: "The authenticated user is not a site admin.",
    content: errorContent("auth"),
  },
};

/**
 * Admits only site admins, for admin routes that org admins can't use. Runs
 * after `requireAdminScope`, which sets the `adminScope` it reads.
 */
export const requireSiteAdminScope = createMiddleware<AdminEnv>(
  async (c, next) => {
    if (c.var.adminScope.kind !== "site") {
      return c.json(
        applicationError({
          auth: { message: "Site admin permission required" },
        }),
        403
      );
    }
    await next();
  }
);
