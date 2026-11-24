import { ValidationIssuesResponse } from "#src/lib/middleware/validation-errors.js";
import { isDuplicateEntryError } from "#src/lib/utils/db-errors.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { ARCADIA_SCIENCE_NAME } from "#v1/lib/constants.js";
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
import { PutDoiBodySchema } from "./route-requests/put-doi.js";
import { PutDoiResponseSchema } from "./route-responses/doi.js";

export const putDoiRoute = createAuthedRoute({
  method: "put",
  path: "/id/{id}/doi",
  stability: "stable",
  tags: ["publications"],
  summary: "Record an external DOI",
  description:
    "Records a DOI that was minted and is managed externally to The " +
    "Stacks. The client owns the DOI's state; this endpoint only stores " +
    "the value against the publication.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: PutDoiBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "The DOI was recorded.",
      content: {
        "application/json": { schema: PutDoiResponseSchema },
      },
    },
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
    409: {
      description:
        "The DOI for a publication cannot be updated after it is published",
      content: errorContent("publication"),
    },
    422: {
      ...ValidationIssuesResponse[422],
      description:
        "The request failed validation, or the `doi` is already in use by " +
        "another publication.",
    },
  },
});

export async function putDoiHandler(
  c: HandlerContext<typeof putDoiRoute>
): HandlerReturnType<typeof putDoiRoute> {
  const user = c.var.user;
  const id = c.req.valid("param").id;
  const repos = new Repositories();
  const publicationRow = await repos.publications.findById(id);

  if (!publicationRow) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  if (
    !(await repos.publications.canEdit(
      user.id,
      publicationRow.id,
      publicationRow.ownerId
    ))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const potentialOrgs = await repos.orgs.listPotentialOrgsForPublication(
    publicationRow.id,
    publicationRow.ownerId
  );

  const selfMintingEnabled = potentialOrgs.some(
    (o) => o.name === ARCADIA_SCIENCE_NAME
  );

  if (!selfMintingEnabled) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  if (publicationRow.state !== "DRAFT") {
    return c.json(
      applicationError({
        publication: { message: "Publication already published" },
      }),
      409
    );
  }

  const { doi } = c.req.valid("json");

  try {
    await repos.publications.update(id, { doi });
  } catch (error) {
    if (isDuplicateEntryError(error, "publications_doi_unique")) {
      return c.var.validationErrors([
        {
          code: "custom",
          path: ["doi"],
          message: "DOI is already in use by another publication",
        },
      ]);
    }
    throw error;
  }

  return c.json({}, 200);
}
