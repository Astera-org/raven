import {
  DoiAttributesSchema,
  type DoiAttributes,
} from "#src/types/datacite.js";
import { z } from "@hono/zod-openapi";

// This simplifies the TypeScript so the depth doesn't get crazy
export const GetDoiResponseSchema =
  DoiAttributesSchema.nullable() as z.ZodNullable<z.ZodType<DoiAttributes>>;

export const DoiEligibilityResponseSchema = z.object({
  minting: z.boolean(),
  selfMinting: z.boolean().optional(),
});

export const PostDoiResponseSchema = z.object({
  publicationId: z.string(),
  slug: z.string(),
  versionNumber: z.int(),
  doi: z.string(),
  versionDoi: z.string().nullable(),
});

export const PutDoiResponseSchema = z.object({});
