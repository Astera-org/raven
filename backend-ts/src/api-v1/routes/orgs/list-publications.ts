import type { AppEnv } from "#src/types/hono.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { type RouteHandler } from "@hono/zod-openapi";
import { toUtcIso } from "./helpers.js";
import {
  OrgIdOrSlugParamSchema,
  OrgPublicationsListResponseSchema,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// GET /{idOrSlug}/publications — list the organization's publications
// ---------------------------------------------------------------------------

export const listOrgPublicationsRoute = createV1Route({
  method: "get",
  path: "/{idOrSlug}/publications",
  tags: ["orgs"],
  summary: "List an organization's publications",
  request: {
    params: OrgIdOrSlugParamSchema,
    query: PaginationQueryRequestSchema,
  },
  responses: {
    200: {
      description: "The organization's published publications.",
      content: {
        "application/json": { schema: OrgPublicationsListResponseSchema },
      },
    },
    404: {
      description: "No organization exists for the given id or slug.",
      content: errorContent("org"),
    },
  },
});

export const listOrgPublicationsHandler: RouteHandler<
  typeof listOrgPublicationsRoute,
  AppEnv
> = async (c) => {
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

  const query = c.req.valid("query");
  const result = await repositories.orgs.listPublications(orgId, query);
  return c.json(
    {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        createdAt: toUtcIso(item.createdAt),
      })),
    },
    200
  );
};
