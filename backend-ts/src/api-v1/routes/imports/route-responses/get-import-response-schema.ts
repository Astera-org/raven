import {
  MEDIA_IMPORT_ERROR_CODES,
  MEDIA_IMPORT_ITEM_STATUSES,
} from "#src/db/schema.js";
import { z } from "@hono/zod-openapi";
import { MEDIA_REF_PREFIX } from "@raven/core-import-format";

export const MediaUploadUrlSourceSchema = z
  .object({
    type: z.literal("url"),
    url: z.string(),
  })
  .openapi("MediaUploadUrlSource", {
    description: "Media copied from where the document links to it.",
  });

export const MediaUploadBytesSourceSchema = z
  .object({
    type: z.literal("bytes"),
    filename: z.string(),
    mimeType: z.string().optional(),
  })
  .openapi("MediaUploadBytesSource", {
    description:
      "Media that came with the document, e.g. an image embedded as a " +
      "`data:` URL. `filename` may be made up for it.",
  });

export const MediaUploadSourceSchema = z
  .discriminatedUnion("type", [
    MediaUploadUrlSourceSchema,
    MediaUploadBytesSourceSchema,
  ])
  .openapi("MediaUploadSource");

export const MediaUploadErrorSchema = z
  .object({
    code: z.enum(MEDIA_IMPORT_ERROR_CODES),
    message: z.string().openapi({ description: "Can be shown to the user." }),
  })
  .openapi("MediaUploadError");

export const MediaUploadItemResponseSchema = z.object({
  id: z.string(),
  ref: z.string().startsWith(MEDIA_REF_PREFIX),
  status: z.enum(MEDIA_IMPORT_ITEM_STATUSES),
  url: z.string().nullable(),
  source: MediaUploadSourceSchema,
  error: MediaUploadErrorSchema.nullable().openapi({
    description: "Why the upload failed; set once `status` is `failed`.",
  }),
});
export type MediaUploadItemResponse = z.infer<
  typeof MediaUploadItemResponseSchema
>;

export const ImportStatusResponseSchema = z.object({
  publicationId: z.string(),
  versionId: z.string(),
  settled: z.boolean(),
  uploads: z.array(MediaUploadItemResponseSchema),
});
export type ImportStatusResponse = z.infer<typeof ImportStatusResponseSchema>;
