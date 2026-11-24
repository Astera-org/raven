import { type AuthEnv } from "#src/types/hono.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import {
  getMyPublicationListRoute,
  toMyPublicationListResponse,
} from "#v1/routes/users/get-my-publication-list.js";
import { type RouteHandler } from "@hono/zod-openapi";

export const getDraftsRoute = createV1Route({
  ...getMyPublicationListRoute,
  path: "/drafts",
  stability: "stable",
  tags: ["publications"],
  summary: "List the caller's own draft publications",
  description:
    "Deprecated: use `GET /users/me/publications?state=draft`, which " +
    "returns the same items. This collection's contents depend on the " +
    "caller, which the path doesn't say.",
  request: { query: PaginationQueryRequestSchema },
  deprecated: true,
});

export const getDraftsHandler: RouteHandler<
  typeof getDraftsRoute,
  AuthEnv
> = async (c) => {
  const user = c.var.user;
  const result = await makeRepositories().publications.listForOwner(user.id, {
    state: "draft",
    pagination: c.req.valid("query"),
  });
  return c.json(toMyPublicationListResponse(result), 200);
};
