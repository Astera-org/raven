import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { z } from "@hono/zod-openapi";
import { getOrCreateDraft } from "./helpers/get-or-create-draft.js";
import { CreateDraftResponseSchema } from "./route-responses/create-draft.js";

export const postDraftByIdRoute = createAuthedRoute({
  method: "post",
  path: "/id/{id}/draft",
  tags: ["publications"],
  summary: "Create a new draft by ID",
  description: "Creates a new draft version of an existing publication.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    200: {
      description: "A draft version already existed.",
      content: {
        "application/json": {
          schema: CreateDraftResponseSchema,
        },
      },
    },
    201: {
      description: "The publication's new draft version was created.",
      content: {
        "application/json": {
          schema: CreateDraftResponseSchema,
        },
      },
    },
    403: {
      description:
        "The authenticated user is not permitted to edit this publication.",
      content: errorContent("auth"),
    },
    404: {
      description: "The publication in question was not found.",
      content: errorContent("publication", "version"),
    },
  },
});

export async function postDraftByIdHandler(
  c: HandlerContext<typeof postDraftByIdRoute>
): HandlerReturnType<typeof postDraftByIdRoute> {
  const publicationId = c.req.valid("param").id;
  const repos = makeRepositories();
  const user = c.var.user;

  const pubRow = await repos.publications.findById(publicationId);

  if (!pubRow) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  if (
    !(await repos.publications.canEdit(user.id, publicationId, pubRow.ownerId))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const result = await getOrCreateDraft(repos, pubRow);

  if (result.status === "missing-latest-version") {
    return c.json(
      applicationError({
        version: {
          message: "Publication does not have an existing version.",
        },
      }),
      404
    );
  }

  return c.json(
    { publicationId, slug: pubRow.slug, versionId: result.draft.id },
    result.status === "created" ? 201 : 200
  );
}
