import type { AppEnv } from "#src/types/hono.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { type RouteHandler } from "@hono/zod-openapi";
import { toOrgResponse } from "./helpers.js";
import { OrgIdOrSlugParamSchema, OrgResponseSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// GET /{idOrSlug} — organization detail
// ---------------------------------------------------------------------------

export const getOrgRoute = createV1Route({
  method: "get",
  path: "/{idOrSlug}",
  tags: ["orgs"],
  summary: "Get an organization",
  request: { params: OrgIdOrSlugParamSchema },
  responses: {
    200: {
      description: "The organization.",
      content: { "application/json": { schema: OrgResponseSchema } },
    },
    404: {
      description: "No organization exists for the given id or slug.",
      content: errorContent("org"),
    },
  },
});

export const getOrgHandler: RouteHandler<typeof getOrgRoute, AppEnv> = async (
  c
) => {
  const repositories = makeRepositories();
  const { idOrSlug } = c.req.valid("param");
  const org = await repositories.orgs.findOrgByIdentifier(idOrSlug);
  if (!org) {
    return c.json(
      applicationError({ org: { message: "Organization not found" } }),
      404
    );
  }

  const userId = c.get("user")?.id;
  const canEditOrg = userId
    ? await repositories.orgs.canEdit(org.id, userId)
    : false;

  return c.json(toOrgResponse(org, canEditOrg), 200);
};
