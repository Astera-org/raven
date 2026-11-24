import { ValidationIssueSchema } from "#src/lib/middleware/validation-errors.js";
import { CreateDraftResponseSchema } from "#v1/routes/publications/route-responses/create-draft.js";
import { z } from "@hono/zod-openapi";

export const PostImportResponseSchema = CreateDraftResponseSchema.extend({
  importId: z.string().openapi({
    description: "Poll `GET /imports/{importId}` for media upload progress.",
  }),
  settled: z.boolean().openapi({
    description:
      "False while media is still being copied to Raven. Until then the " +
      "draft body holds `raven-media://` refs and can't be edited or " +
      "published.",
  }),
  validationErrors: z.array(ValidationIssueSchema).openapi({
    description:
      "Problems that didn't stop the import, e.g. contributors that couldn't " +
      "be matched to a Raven user and were skipped, and anything the draft " +
      "still needs before it can be published.",
  }),
}).openapi("PostImportResponse");
