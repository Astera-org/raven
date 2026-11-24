import { Repositories } from "#v1/db-repositories/index.js";
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

export const deleteDraftRoute = createAuthedRoute({
  method: "delete",
  path: "/id/{id}/draft",
  stability: "stable",
  tags: ["publications"],
  summary: "Delete a publication's draft",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    204: { description: "The draft was deleted." },
    403: {
      description:
        "The authenticated user does not have edit permission on this " +
        "publication.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication exists for the given ID, or it has no draft.",
      content: errorContent("publication", "draft"),
    },
  },
});

export async function deleteDraftHandler(
  c: HandlerContext<typeof deleteDraftRoute>
): HandlerReturnType<typeof deleteDraftRoute> {
  const user = c.var.user;
  const id = c.req.valid("param").id;
  const repos = new Repositories();
  const publication = await repos.publications.findById(id);
  if (!publication) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  if (
    !(await repos.publications.canEdit(
      user.id,
      publication.id,
      publication.ownerId
    ))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const draftVersionId = await repos.versions.findDraftIdByPubId(
    publication.id
  );
  if (!draftVersionId) {
    return c.json(
      applicationError({ draft: { message: "No draft found" } }),
      404
    );
  }

  await repos.versions.update(draftVersionId, { state: "DELETED" });
  return noContentResponse(c);
}
