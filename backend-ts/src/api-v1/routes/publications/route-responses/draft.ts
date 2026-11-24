import { ValidationIssueSchema } from "#src/lib/middleware/validation-errors.js";
import { PatchPublicationStrictSchema } from "#v1/routes/publications/route-requests/patch-publication.js";
import { z } from "@hono/zod-openapi";
import { DraftPublicationResponseSchema } from "./publication.js";

export const GetDraftResponseSchema = z.object({
  publication: DraftPublicationResponseSchema,
  validationErrors: z.array(ValidationIssueSchema).optional(),
});

const FieldKeysSchema = PatchPublicationStrictSchema.keyof();

/**
 * Equivalent to:
 *
 * ```ts
 * type RejectedFields = Partial<
 *  Record<
 *    keyof PublicationUpdate,
 *    ValidationIssue
 *  >
 * > | undefined
 * ```
 */
const RejectedFieldsSchema = z
  .partialRecord(FieldKeysSchema, ValidationIssueSchema)
  .optional();

export const PatchDraftResponseSchema = z.object({
  publication: DraftPublicationResponseSchema,
  applied: z.array(FieldKeysSchema),
  rejected: RejectedFieldsSchema,
  validationErrors: z.array(ValidationIssueSchema),
});
