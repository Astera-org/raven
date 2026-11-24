import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { type RouteHandler, z } from "@hono/zod-openapi";
import { buildAdminPublicationResponse } from "./helpers/build-admin-publication-response.js";
import { AdminPublicationParamSchema } from "./route-requests/admin-publication-params.js";
import { AdminPublicationResponseSchema } from "./route-responses/admin-publication.js";

export const getAdminPublicationVersionRoute = createAdminRoute({
  method: "get",
  path: "/publications/{idOrSlug}/versions/{versionNumber}",
  tags: ["admin"],
  summary: "Get a version of a publication the caller administers",
  description:
    "Admin view of one version of a publication, in the same shape as the " +
    "publication route. Serves any version that the route lists. " +
    "Publications outside the caller's admin scope " +
    "are not found.",
  request: {
    params: AdminPublicationParamSchema.extend({
      // Digits only with no leading zero, so each version has one URL. The
      // range check rejects digit strings too long to convert exactly, which
      // `Number` would round or turn into Infinity.
      versionNumber: z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .pipe(z.number().int().max(Number.MAX_SAFE_INTEGER))
        .openapi({
          param: { name: "versionNumber", in: "path" },
          description: "The version number.",
          example: "2",
        }),
    }),
  },
  responses: {
    200: {
      description: "The publication at the requested version.",
      content: {
        "application/json": {
          schema: z.object({ publication: AdminPublicationResponseSchema }),
        },
      },
    },
    404: {
      description:
        "No publication found in the caller's admin scope, or it lists " +
        "no such version.",
      content: errorContent("publication", "version"),
    },
  },
});

/**
 * Serves only the versions the detail route lists, so every row in the admin
 * versions table opens and nothing else does.
 */
export const getAdminPublicationVersionHandler: RouteHandler<
  typeof getAdminPublicationVersionRoute,
  AdminEnv
> = async (c) => {
  const { idOrSlug, versionNumber } = c.req.valid("param");
  const repos = makeRepositories();
  const publicationNotFound = () =>
    c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  const versionNotFound = () =>
    c.json(
      applicationError({ version: { message: "Version not found" } }),
      404
    );

  const found = await repos.publications.findAdministered(
    c.var.adminScope,
    idOrSlug
  );
  if (!found) return publicationNotFound();

  const { publication: pub } = found;
  const versionRows = await repos.versions.list(pub.id, true);
  const listed = versionRows.find((row) => row.versionNumber === versionNumber);
  if (!listed) return versionNotFound();

  const [version, contributorRows, commentsCount] = await Promise.all([
    repos.versions.findById(listed.id),
    repos.contributors.listByVersionId(listed.id),
    repos.publications.countComments(pub.id),
  ]);
  // A concurrent request can have discarded the draft since it was listed.
  // Discarding only marks the row DELETED, so the row itself can still load.
  if (!version || version.state === "DELETED") return versionNotFound();

  return c.json(
    {
      publication: await buildAdminPublicationResponse(pub, version, {
        versionRows,
        contributorRows,
        commentsCount,
      }),
    },
    200
  );
};
