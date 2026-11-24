import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { type RouteHandler, z } from "@hono/zod-openapi";
import { loadAdminPublicationResponse } from "./helpers/load-admin-publication-response.js";
import { AdminPublicationParamSchema } from "./route-requests/admin-publication-params.js";
import { AdminPublicationResponseSchema } from "./route-responses/admin-publication.js";

export const getAdminPublicationRoute = createAdminRoute({
  method: "get",
  path: "/publications/{idOrSlug}",
  tags: ["admin"],
  summary: "Get a publication the caller administers",
  description:
    "Admin view of one publication. Serves the latest published version, or " +
    "the current draft if it has never been published, and lists every " +
    "published version plus the current draft with their states, even once " +
    "the publication is removed. A removed publication that was published " +
    "serves its last version, the one it was removed with; one that was " +
    "never published serves its draft. Publications outside the caller's " +
    "admin scope are not found.",
  request: {
    params: AdminPublicationParamSchema,
  },
  responses: {
    200: {
      description: "The publication.",
      content: {
        "application/json": {
          schema: z.object({ publication: AdminPublicationResponseSchema }),
        },
      },
    },
    404: {
      description: "No publication found in the caller's admin scope.",
      content: errorContent("publication"),
    },
  },
});

export const getAdminPublicationHandler: RouteHandler<
  typeof getAdminPublicationRoute,
  AdminEnv
> = async (c) => {
  const { idOrSlug } = c.req.valid("param");
  const scope = c.var.adminScope;
  const repos = makeRepositories();
  const publicationNotFound = () =>
    c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );

  const found = await repos.publications.findAdministered(scope, idOrSlug);
  if (!found) return publicationNotFound();

  return c.json(
    {
      publication: await loadAdminPublicationResponse(
        repos,
        found.publication,
        found.version
      ),
    },
    200
  );
};
