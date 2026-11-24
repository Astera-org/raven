import { deleteDraftDois, setDoisFindable } from "#src/lib/datacite/client.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { noContentResponse } from "#v1/lib/route-responses/no-content.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { z } from "@hono/zod-openapi";

export const deletePublicationRoute = createAuthedRoute({
  method: "delete",
  path: "/id/{id}",
  tags: ["publications"],
  summary: "Delete a publication",
  description:
    "Deletes a publication. One that was never published is removed " +
    "permanently, along with its versions and slug, after its draft " +
    "DOIs are deleted at DataCite; if DataCite fails, the publication " +
    "is kept and the request can be retried. One that was published is " +
    "marked as deleted: its DOIs move from findable to registered, and " +
    "if it has a DOI its last published version stays reachable so the " +
    "DOI keeps resolving. Publishing a new version makes it findable " +
    "again.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    204: { description: "The publication was deleted." },
    403: {
      description:
        "The authenticated user does not have edit permission on this " +
        "publication.",
      content: errorContent("auth"),
    },
    404: {
      description: "No publication exists for the given ID.",
      content: errorContent("publication"),
    },
    502: {
      description:
        "The publication was never published and its draft DOIs could not " +
        "be deleted at DataCite. The publication was kept; retry later.",
      content: errorContent("datacite"),
    },
  },
});

export async function deletePublicationHandler(
  c: HandlerContext<typeof deletePublicationRoute>
): HandlerReturnType<typeof deletePublicationRoute> {
  const id = c.req.valid("param").id;
  const user = c.var.user;
  const repos = makeRepositories();

  const pub = await repos.publications.findById(id);
  if (!pub)
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );

  if (!(await repos.publications.canEdit(user.id, pub.id, pub.ownerId)))
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );

  if (pub.state === "DELETED") return noContentResponse(c);

  if (!(await repos.versions.hasPublished(pub.id))) {
    const draftDois = [
      ...(pub.doi ? [pub.doi] : []),
      ...(await repos.versions.listDois(pub.id)),
    ];
    // DataCite first: once the rows are gone, nothing records these DOIs.
    if (!(await deleteDraftDois(draftDois))) {
      c.var.logger.error(
        { publicationId: pub.id, dois: draftDois },
        "Failed to delete draft DOIs; publication not deleted"
      );
      return c.json(
        applicationError({
          datacite: {
            message: "Could not delete the publication's DOIs at DataCite",
          },
        }),
        502
      );
    }
    await repos.transaction((repos) => repos.publications.delete(pub.id));
    return noContentResponse(c);
  }

  await repos.publications.updateState(pub.id, "DELETED");
  const publishedDois = [
    ...(pub.doi ? [pub.doi] : []),
    ...(await repos.versions.listDois(pub.id, { state: "PUBLISHED" })),
  ];
  if (
    publishedDois.length > 0 &&
    !(await setDoisFindable(publishedDois, false))
  ) {
    c.var.logger.error(
      { publicationId: pub.id, dois: publishedDois },
      "Failed to hide DOIs for a deleted publication"
    );
  }
  return noContentResponse(c);
}
