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
import { AdminUpdatePublicationBodySchema } from "./route-requests/patch-admin-publication.js";
import { AdminPublicationResponseSchema } from "./route-responses/admin-publication.js";

export const patchAdminPublicationRoute = createAdminRoute({
  method: "patch",
  path: "/publications/{idOrSlug}",
  tags: ["admin"],
  summary: "Update a publication the caller administers",
  description:
    "Partial update: a field omitted from the body is left untouched. " +
    "`doiMetadata` replaces the DataCite metadata stored for the " +
    "publication's DOIs. It is only saved here: DataCite receives it the " +
    "next time one of the publication's DOIs is minted or updated. " +
    "Publications outside the caller's admin scope are not found.",
  request: {
    params: AdminPublicationParamSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: AdminUpdatePublicationBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "The publication, with the patch applied.",
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

export const patchAdminPublicationHandler: RouteHandler<
  typeof patchAdminPublicationRoute,
  AdminEnv
> = async (c) => {
  const { idOrSlug } = c.req.valid("param");
  const body = c.req.valid("json");
  const repos = makeRepositories();

  const found = await repos.publications.findAdministered(
    c.var.adminScope,
    idOrSlug
  );
  if (!found) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  const { publication, version } = found;
  if (body.doiMetadata !== undefined) {
    await repos.publications.update(publication.id, {
      doiMetadata: body.doiMetadata,
    });
  }

  return c.json(
    {
      publication: await loadAdminPublicationResponse(
        repos,
        {
          ...publication,
          doiMetadata: body.doiMetadata ?? publication.doiMetadata,
        },
        version
      ),
    },
    200
  );
};
