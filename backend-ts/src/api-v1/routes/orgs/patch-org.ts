import { emptyToNull } from "#src/lib/utils/string.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { requireEditableOrg, toOrgResponse } from "./helpers.js";
import {
  OrgIdOrSlugParamSchema,
  OrgResponseSchema,
  UpdateOrgBodySchema,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// PATCH /{idOrSlug} — partial update
// ---------------------------------------------------------------------------

export const patchOrgRoute = createAuthedRoute({
  method: "patch",
  path: "/{idOrSlug}",
  tags: ["orgs"],
  summary: "Update an organization",
  description:
    "Partial update: a field omitted from the body is left untouched. " +
    "`avatar`/`profile` may be set to `null` to clear them; `name` may not " +
    "be cleared.",
  request: {
    params: OrgIdOrSlugParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateOrgBodySchema } },
    },
  },
  responses: {
    200: {
      description: "The patch was applied.",
      content: { "application/json": { schema: OrgResponseSchema } },
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

export async function patchOrgHandler(
  c: HandlerContext<typeof patchOrgRoute>
): HandlerReturnType<typeof patchOrgRoute> {
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

  const body = c.req.valid("json");
  const updates: {
    name?: string;
    avatar?: string | null;
    profile?: string | null;
  } = {};
  if (body.name !== undefined) updates.name = body.name;
  if ("avatar" in body) updates.avatar = emptyToNull(body.avatar ?? null);
  if ("profile" in body) updates.profile = emptyToNull(body.profile ?? null);

  await repositories.orgs.update(result.orgId, updates);

  // The org can have been deleted by a concurrent request between the
  // permission check above and this re-fetch.
  const org = await repositories.orgs.findOrgByIdentifier(result.orgId);
  if (!org) {
    return c.json(
      applicationError({ org: { message: "Organization not found" } }),
      404
    );
  }
  return c.json(toOrgResponse(org, true), 200);
}
