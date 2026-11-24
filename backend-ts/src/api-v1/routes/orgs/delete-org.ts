import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { noContentResponse } from "#v1/lib/route-responses/no-content.js";

import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { requireEditableOrg } from "./helpers.js";
import { OrgIdOrSlugParamSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// DELETE /{idOrSlug} — soft delete
// ---------------------------------------------------------------------------

export const deleteOrgRoute = createAuthedRoute({
  method: "delete",
  path: "/{idOrSlug}",
  tags: ["orgs"],
  summary: "Delete an organization",
  request: { params: OrgIdOrSlugParamSchema },
  responses: {
    204: { description: "The organization was deleted." },
    403: {
      description:
        "The authenticated user does not have edit permission on this organization.",
      content: errorContent("auth"),
    },
    404: {
      description: "No organization exists for the given id or slug.",
      content: errorContent("org"),
    },
  },
});

export async function deleteOrgHandler(
  c: HandlerContext<typeof deleteOrgRoute>
): HandlerReturnType<typeof deleteOrgRoute> {
  const repositories = makeRepositories();
  const userId = c.get("user").id;
  const { idOrSlug } = c.req.valid("param");
  const result = await requireEditableOrg(repositories.orgs, idOrSlug, userId);
  if (!result.ok) {
    return result.status === 404
      ? c.json(
          applicationError({ org: { message: "Organization not found" } }),
          404
        )
      : c.json(
          applicationError({ auth: { message: "Permission denied" } }),
          403
        );
  }

  await repositories.transaction(async (repos) => {
    await repos.orgs.softDelete(result.orgId);
    await repos.orgs.deleteAllMemberships(result.orgId);
    await repos.orgs.deleteAllPublicationMaps(result.orgId);
  });
  return noContentResponse(c);
}
