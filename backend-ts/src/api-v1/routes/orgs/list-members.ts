import { getPagination } from "#src/lib/utils/get-pagination.js";
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
  OrgMembersListResponseSchema,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// GET /{idOrSlug}/members — list members
// ---------------------------------------------------------------------------

export const listMembersRoute = createV1Route({
  method: "get",
  path: "/{idOrSlug}/members",
  tags: ["orgs"],
  summary: "List an organization's members",
  request: {
    params: OrgIdOrSlugParamSchema,
    query: PaginationQueryRequestSchema,
  },
  responses: {
    200: {
      description:
        "The organization's active members. Org admins and site admins get " +
        "full member records (`OrgMember`); everyone else, including " +
        "anonymous callers, gets only user id, username, name, avatar, " +
        "and ORCID (`PublicOrgMember`). Unlike v0, an organization with no " +
        "members returns an empty list rather than 404.",
      content: {
        "application/json": {
          schema: OrgMembersListResponseSchema,
        },
      },
    },
    404: {
      description: "No organization exists for the given id or slug.",
      content: errorContent("org"),
    },
  },
});

export const listMembersHandler: RouteHandler<
  typeof listMembersRoute,
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
  const { page, perPage, offset } = getPagination(query);

  const userId = c.get("user")?.id;
  const [rows, total, canEditOrg] = await Promise.all([
    repositories.orgs.listActiveMembers(orgId, perPage, offset),
    repositories.orgs.countActiveMembers(orgId),
    userId ? repositories.orgs.canEdit(orgId, userId) : false,
  ]);

  if (!canEditOrg) {
    return c.json(
      {
        items: rows.map((row) => ({
          userId: row.id,
          username: row.username,
          firstName: row.firstName,
          lastName: row.lastName,
          avatar: row.image,
          orcid: row.orcid,
        })),
        pagination: { total, page, perPage },
      },
      200
    );
  }

  const items = rows.map((row) => ({
    userId: row.id,
    username: row.username,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    avatar: row.image,
    orcid: row.orcid,
    isAdmin: (row.roles ?? []).includes("ADMIN"),
    startAt: toUtcIso(row.startAt),
    endAt: toUtcIso(row.endAt),
  }));

  return c.json(
    {
      items,
      pagination: { total, page, perPage },
    },
    200
  );
};
