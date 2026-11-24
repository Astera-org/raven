import { ValidationIssueSchema } from "#src/lib/middleware/validation-errors.js";
import { LinksSchema } from "#v1/lib/route-responses/links.js";
import { z } from "@hono/zod-openapi";

export const CreateDraftResponseSchema = z.object({
  publicationId: z.string(),
  slug: z.string(),
  versionId: z.string(),
});

export const CreatePublicationResponseSchema = CreateDraftResponseSchema.extend(
  {
    validationErrors: z.array(ValidationIssueSchema).openapi({
      description:
        "Errors with severity 'error' that prevent the draft from being published; those with severity 'warning' are for informational purposes and do not stop publishing.",
    }),
    links: LinksSchema.openapi({
      description: "`edit`: where to edit the draft in the web UI.",
    }),
  }
);
