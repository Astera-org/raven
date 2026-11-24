import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import {
  type AdminEnv,
  isOrgInAdminScope,
} from "#v1/routes/admin/middleware/require-admin-scope.js";
import { AdminPublicationListResponseSchema } from "#v1/routes/admin/publications/route-responses/admin-publication-list.js";
import { OrgIdOrSlugParamSchema } from "#v1/routes/orgs/schemas.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";

// ---------------------------------------------------------------------------
// GET /{idOrSlug}/publications — list the organization's publications
// ---------------------------------------------------------------------------

export const getAdminOrgPublicationsRoute = createAdminRoute({
  method: "get",
  path: "/orgs/{idOrSlug}/publications",
  tags: ["orgs"],
  summary: "List an organization's publications",
  request: {
    params: OrgIdOrSlugParamSchema,
    query: PaginationQueryRequestSchema,
  },
  responses: {
    200: {
      description:
        "The organization's publications in every state, including drafts " +
        "and removed publications.",
      content: {
        "application/json": { schema: AdminPublicationListResponseSchema },
      },
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

export async function getAdminOrgPublicationsHandler(
  c: HandlerContext<typeof getAdminOrgPublicationsRoute, AdminEnv>
): HandlerReturnType<typeof getAdminOrgPublicationsRoute> {
  const repositories = makeRepositories();
  const { idOrSlug } = c.req.valid("param");
  const org = await repositories.orgs.findOrgByIdentifier(idOrSlug);
  if (!org) {
    return c.json(
      applicationError({ org: { message: "Organization not found" } }),
      404
    );
  }
  const orgId = org.id;

  if (!isOrgInAdminScope(c.var.adminScope, orgId)) {
    return c.json(
      applicationError({ auth: { message: "Not authorized to access org" } }),
      403
    );
  }

  return c.json(
    await repositories.publications.listAdministered({
      scope: c.var.adminScope,
      state: "all",
      orgId,
      pagination: c.req.valid("query"),
    }),
    200
  );
}
