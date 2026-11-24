import { DoiMetadataSchema } from "#src/db/schema.js";
import { z } from "@hono/zod-openapi";

export const AdminUpdatePublicationBodySchema = z
  .object({
    doiMetadata: DoiMetadataSchema.optional(),
  })
  .openapi("AdminUpdatePublicationBody");
