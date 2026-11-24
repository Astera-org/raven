import { dataciteRawGet } from "#src/lib/datacite/client.js";
import { DataciteRequestError } from "#src/lib/errors/datacite-request-error.js";
import { type DoiAttributes } from "#src/types/datacite.js";

import { Repositories } from "#v1/db-repositories/index.js";
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
import { GetDoiResponseSchema } from "./route-responses/doi.js";

export const getDoiRoute = createAuthedRoute({
  method: "get",
  path: "/id/{id}/doi",
  stability: "stable",
  tags: ["publications"],
  summary: "Get DOI metadata",
  description:
    "Returns the metadata for the publication's DOI from DataCite. The " +
    "DOI must already be recorded on the publication.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    200: {
      description: "The DOI was recorded.",
      content: {
        "application/json": {
          schema: GetDoiResponseSchema,
        },
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
      content: errorContent("publication", "doi"),
    },
    502: {
      description:
        "DataCite has no record for the DOI, or couldn't be queried (no " +
        "response, an error status such as a rate limit, or an unreadable " +
        "body).",
      content: errorContent("datacite"),
    },
  },
});

export async function getDoiHandler(
  c: HandlerContext<typeof getDoiRoute>
): HandlerReturnType<typeof getDoiRoute> {
  const user = c.var.user;
  const repos = new Repositories();
  const id = c.req.valid("param").id;
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

  if (!publicationRow.doi) {
    return c.json(
      applicationError({ doi: { message: "DOI not minted yet for pub" } }),
      404
    );
  }

  let doi: DoiAttributes | null;
  try {
    doi = await dataciteRawGet(publicationRow.doi);
  } catch (e) {
    if (!(e instanceof DataciteRequestError)) throw e;
    c.var.logger.error({ err: e, publicationId: id }, "DataCite GET failed");
    return c.json(
      applicationError({ datacite: { message: "Failed to query Datacite" } }),
      502
    );
  }

  if (doi === null) {
    return c.json(
      applicationError({ datacite: { message: "Failed to query Datacite" } }),
      502
    );
  }

  return c.json(doi, 200);
}
