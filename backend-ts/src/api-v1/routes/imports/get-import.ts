import { ValidationIssuesResponse } from "#src/lib/middleware/validation-errors.js";
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
import { buildMediaUploadResponse } from "./build-media-upload-response.js";
import { ImportStatusResponseSchema } from "./route-responses/get-import-response-schema.js";

export const getImportRoute = createAuthedRoute({
  method: "get",
  path: "/{id}",
  stability: "stable",
  tags: ["imports"],
  summary: "Get import status",
  description: "Gets the status of a current import, and its background tasks.",
  request: {
    params: z.object({
      id: ulidSchema({ fieldName: "id" }).openapi({
        param: { name: "id", in: "path" },
      }),
    }),
  },
  responses: {
    200: {
      description: "The status of the import and its media uploads.",
      content: {
        "application/json": { schema: ImportStatusResponseSchema },
      },
    },
    404: {
      description: "The publication import cannot be found for this user.",
      content: errorContent("import"),
    },
    ...ValidationIssuesResponse,
  },
});

type GetImportRoute = typeof getImportRoute;

export async function getImportHandler(
  c: HandlerContext<GetImportRoute>
): HandlerReturnType<GetImportRoute> {
  const user = c.var.user;
  const repos = new Repositories();
  const { id: importId } = c.req.valid("param");

  const version = await repos.versions.findByImportId(importId);
  const publication = version
    ? await repos.publications.findById(version.publicationId)
    : null;
  const canEdit =
    version && publication
      ? await repos.publications.canEdit(
          user.id,
          version.publicationId,
          publication.ownerId
        )
      : null;
  if (!version || !publication || !canEdit) {
    return c.json(
      applicationError({
        import: { message: "The publication import cannot be found" },
      }),
      404
    );
  }

  const batch = await repos.imports.findMediaImportBatchByImportId(importId);
  const uploads = batch
    ? (await repos.imports.listMediaImportItems(batch.id)).map(
        buildMediaUploadResponse
      )
    : [];

  return c.json(
    {
      publicationId: version.publicationId,
      versionId: version.id,
      settled: !["processing", "finalizing"].includes(batch?.status ?? ""),
      uploads,
    },
    200
  );
}
