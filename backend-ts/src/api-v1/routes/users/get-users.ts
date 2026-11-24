import { type AppEnv } from "#src/types/hono.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import { type RouteHandler } from "@hono/zod-openapi";
import { GetUsersQuerySchema } from "./route-requests/get-users.js";
import { UserListResponseSchema } from "./route-responses/user-list.js";

export const getUsersRoute = createV1Route({
  method: "get",
  path: "/",
  stability: "stable",
  tags: ["users"],
  summary: "List or search users",
  description:
    "Without `q`: a paginated list of all active users, newest first. " +
    "With `q`: up to 20 users ranked by relevance to the query (username, " +
    "ORCID, email, or name); `page`/`perPage` are ignored in this mode. " +
    "Combines v0's `GET /users/` and `GET /users/search`.",
  request: {
    query: GetUsersQuerySchema,
  },
  responses: {
    200: {
      description: "Users matching `q`, or the full paginated list.",
      content: {
        "application/json": {
          schema: UserListResponseSchema,
        },
      },
    },
  },
});

export const getUsersHandler: RouteHandler<
  typeof getUsersRoute,
  AppEnv
> = async (c) => {
  const repos = new Repositories();
  const query = c.req.valid("query");
  const q = query.q?.trim();
  const page = query.page;
  const perPage = query.perPage;

  if (q) {
    const items = await repos.users.search(q, { page, perPage });
    return c.json(
      {
        items,
        pagination: { total: items.length, page: 1, perPage: items.length },
      },
      200
    );
  }

  const result = await repos.users.list(query);
  return c.json(result, 200);
};
