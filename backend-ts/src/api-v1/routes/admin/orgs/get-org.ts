import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
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
import { toAdminOrgResponse } from "./helpers/to-admin-org-response.js";
import { AdminOrgResponseSchema } from "./route-responses/orgs.js";

// ---------------------------------------------------------------------------
// GET /{idOrSlug} — organization detail
// ---------------------------------------------------------------------------

export const getAdminOrgRoute = createAdminRoute({
  method: "get",
  path: "/orgs/{idOrSlug}",
  tags: ["orgs"],
  summary: "Get an organization",
  request: { params: OrgIdOrSlugParamSchema },
  responses: {
    200: {
      description: "The organization.",
      content: { "application/json": { schema: AdminOrgResponseSchema } },
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

export async function getAdminOrgHandler(
  c: HandlerContext<typeof getAdminOrgRoute, AdminEnv>
): HandlerReturnType<typeof getAdminOrgRoute> {
  const repositories = makeRepositories();
  const { idOrSlug } = c.req.valid("param");
  const org = await repositories.orgs.findOrgByIdentifier(idOrSlug);

  if (!org) {
    return c.json(
      applicationError({ org: { message: "Organization not found" } }),
      404
    );
  }

  if (!isOrgInAdminScope(c.var.adminScope, org.id)) {
    return c.json(
      applicationError({ auth: { message: "Not authorized to access org" } }),
      403
    );
  }

  const counts = await repositories.orgs.countForAdmins(org.id);

  return c.json(
    toAdminOrgResponse(org, {
      canEditOrg: true,
      counts,
    }),
    200
  );
}
