import { type OrganizationUpdate } from "#src/db/schema.js";
import { emptyToNull } from "#src/lib/utils/string.js";
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
import { AdminUpdateOrgBodySchema } from "./route-requests/patch-admin-org.js";
import { AdminOrgResponseSchema } from "./route-responses/orgs.js";

// ---------------------------------------------------------------------------
// PATCH /orgs/{idOrSlug} — Edit org basic info
// ---------------------------------------------------------------------------

export const patchAdminOrgRoute = createAdminRoute({
  method: "patch",
  path: "/orgs/{idOrSlug}",
  tags: ["orgs"],
  summary: "Update an organization",
  description:
    "Partial update: a field omitted from the body is left untouched. " +
    "`profile`/`rorId`/`doiPrefix` may be set to `null` to clear them; " +
    "`name` may not be cleared.",
  request: {
    params: OrgIdOrSlugParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: AdminUpdateOrgBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The patch was applied.",
      content: { "application/json": { schema: AdminOrgResponseSchema } },
    },
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

export async function patchAdminOrgHandler(
  c: HandlerContext<typeof patchAdminOrgRoute, AdminEnv>
): HandlerReturnType<typeof patchAdminOrgRoute> {
  const repositories = makeRepositories();
  const { idOrSlug } = c.req.valid("param");
  const existingOrg = await repositories.orgs.findOrgByIdentifier(idOrSlug);
  if (!existingOrg) {
    return c.json(
      applicationError({ org: { message: "Organization not found" } }),
      404
    );
  }
  const orgId = existingOrg.id;

  if (!isOrgInAdminScope(c.var.adminScope, orgId)) {
    return c.json(
      applicationError({ auth: { message: "Not authorized to access org" } }),
      403
    );
  }

  const body = c.req.valid("json");
  const updates: OrganizationUpdate = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.profile !== undefined)
    updates.profile = emptyToNull(body.profile ?? null);
  if (body.doiMintingEnabled !== undefined)
    updates.doiMintingEnabled = Boolean(body.doiMintingEnabled);
  if (body.doiPrefix !== undefined)
    updates.doiPrefix = emptyToNull(body.doiPrefix ?? null);
  if (body.rorId !== undefined) updates.rorId = emptyToNull(body.rorId ?? null);
  if (body.unlisted !== undefined) updates.unlisted = Boolean(body.unlisted);

  if (body.slug !== undefined && body.slug !== existingOrg.slug) {
    updates.slug = await repositories.orgs.findNextUnusedSlug(body.slug);
  }

  await repositories.orgs.update(orgId, updates);

  // The org can have been deleted by a concurrent request between the
  // permission check above and this re-fetch.
  const org = await repositories.orgs.findOrgByIdentifier(orgId);
  if (!org) {
    return c.json(
      applicationError({ org: { message: "Organization not found" } }),
      404
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
