import { requireAuth } from "#src/lib/middleware/require-auth.js";
import { type AuthEnv } from "#src/types/hono.js";
import {
  makeRepositories,
  type Repositories,
} from "#v1/db-repositories/index.js";
import { type AdministeredOrgRow } from "#v1/db-repositories/orgs-repository.js";
import { applicationError } from "#v1/lib/route-responses/error-content.js";
import { type Context } from "hono";
import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";

/**
 * `site` is unscoped; `org` limits the caller to `orgs`, the orgs they are an
 * active ADMIN of.
 */
export type AdminScope =
  | { kind: "site" }
  | { kind: "org"; orgs: AdministeredOrgRow[] };

export function isOrgInAdminScope(scope: AdminScope, orgId: string): boolean {
  return scope.kind === "site" || scope.orgs.some((o) => o.id === orgId);
}

export type AdminEnv = {
  Variables: AuthEnv["Variables"] & { adminScope: AdminScope };
};

/**
 * The scope the admin routes grant the user: unscoped for site admins, their
 * administered orgs for ACTIVE users who administer at least one, and null
 * for everyone else. `GET /users/me` reports the same decision, so the admin
 * UI's gate matches these routes.
 */
export async function resolveAdminScope(
  repos: Repositories,
  userId: string
): Promise<AdminScope | null> {
  const userState = await repos.users.findState(userId);
  if (userState === "SITE_ADMIN") return { kind: "site" };
  if (userState !== "ACTIVE") return null;

  const orgs = await repos.orgs.listAdministeredOrgs(userId);
  if (orgs.length === 0) return null;
  return { kind: "org", orgs };
}

/**
 * Admits callers `resolveAdminScope` grants a scope, and stores it as
 * `adminScope` for the admin routes to apply.
 */
export const requireAdminScope = createMiddleware<AdminEnv>(
  every(requireAuth, async (c: Context<AdminEnv>, next) => {
    // Idempotency so running the middleware twice will not make more queries
    if (c.var.adminScope !== undefined) {
      await next();
      return;
    }

    const adminScope = await resolveAdminScope(
      makeRepositories(),
      c.var.user.id
    );
    if (!adminScope) {
      return c.json(
        applicationError({ auth: { message: "Admin permission required" } }),
        403
      );
    }

    c.set("adminScope", adminScope);
    await next();
  })
);
