import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { type RouteHandler } from "@hono/zod-openapi";
import { GetAdminPublicationListQuerySchema } from "./route-requests/get-admin-publication-list.js";
import { AdminPublicationListResponseSchema } from "./route-responses/admin-publication-list.js";

export const getAdminPublicationListRoute = createAdminRoute({
  method: "get",
  path: "/publications",
  tags: ["admin"],
  summary: "List publications the caller administers",
  description:
    "Admin view of publications, most recent first. Site admins see every " +
    "publication; org admins see only publications linked to an org they " +
    "administer, removed publications included.",
  request: { query: GetAdminPublicationListQuerySchema },
  responses: {
    200: {
      description: "A page of publications within the caller's admin scope.",
      content: {
        "application/json": { schema: AdminPublicationListResponseSchema },
      },
    },
  },
});

export const getAdminPublicationListHandler: RouteHandler<
  typeof getAdminPublicationListRoute,
  AdminEnv
> = async (c) => {
  const { state, q, ...pagination } = c.req.valid("query");
  return c.json(
    await makeRepositories().publications.listAdministered({
      scope: c.var.adminScope,
      state,
      searchTerm: q?.trim(),
      pagination,
    }),
    200
  );
};
