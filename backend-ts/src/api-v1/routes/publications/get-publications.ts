import { type AppEnv } from "#src/types/hono.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import { type RouteHandler } from "@hono/zod-openapi";
import { GetPublicationsQuerySchema } from "./route-requests/get-publications.js";
import { PublicationListResponseSchema } from "./route-responses/publication-list-item.js";

export const getPublicationsRoute = createV1Route({
  method: "get",
  path: "/",
  tags: ["publications"],
  summary: "List published publications",
  description:
    "Lists publicly published publications, most recent first. Supports " +
    "full-text search via `q` and filtering to a single tag via `tag`. " +
    "Never includes drafts or deleted publications.",
  request: { query: GetPublicationsQuerySchema },
  responses: {
    200: {
      description: "A page of published publications.",
      content: {
        "application/json": {
          schema: PublicationListResponseSchema,
        },
      },
    },
  },
});

export const getPublicationsHandler: RouteHandler<
  typeof getPublicationsRoute,
  AppEnv
> = async (c) => {
  const repos = makeRepositories();

  const query = c.req.valid("query");

  const searchTerm = (query.q ?? "").trim().toLowerCase();
  const tag = query.tag?.trim().toLowerCase();

  return c.json(
    await repos.publications.list({
      pagination: query,
      searchTerm,
      tags: tag ? [tag] : [],
    }),
    200
  );
};
