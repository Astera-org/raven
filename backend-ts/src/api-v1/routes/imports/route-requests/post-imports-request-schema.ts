import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import { z } from "@hono/zod-openapi";

export const UrlImportSourceSchema = z
  .object({
    type: z.literal("url"),
    url: z.url().openapi({
      example: "https://docs.google.com/document/d/abc123/edit",
    }),
  })
  .openapi("UrlImportSource", {
    description:
      "A publicly shared document. Only Google Docs URLs are supported so far.",
  });

export const ImportSourceSchema = z
  .discriminatedUnion("type", [UrlImportSourceSchema])
  .openapi("ImportSource");

export const AutoImportFormatSchema = z
  .object({ type: z.literal("auto") })
  .openapi("AutoImportFormat", {
    description: "Pick the format from the source.",
  });

export const GoogleDocsImportFormatSchema = z
  .object({
    type: z.literal("gdoc"),
    singleLineBreaks: z
      .enum(["paragraph", "line-break"])
      .optional()
      .openapi({
        description:
          "How a single line break (Shift+Enter) is imported: as a new " +
          "paragraph (the default) or as a line break within the paragraph. " +
          "Two or more in a row always start a new paragraph.",
      }),
  })
  .openapi("GoogleDocsImportFormat", {
    description: "A Google Doc, converted to MyST markdown.",
  });

export const ImportFormatSchema = z
  .discriminatedUnion("type", [
    AutoImportFormatSchema,
    GoogleDocsImportFormatSchema,
  ])
  .openapi("ImportFormat");

export const NewImportTargetSchema = z
  .object({ type: z.literal("new") })
  .openapi("NewImportTarget", {
    description: "Create a new draft publication, owned by the caller.",
  });

export const DraftImportTargetSchema = z
  .object({
    type: z.literal("draft"),
    publicationId: ulidSchema({ fieldName: "publicationId" }),
  })
  .openapi("DraftImportTarget", {
    description:
      "Re-import into this publication's draft: its title, subtitle, " +
      "abstract and body are replaced and the document becomes its current " +
      "import. Contributors, orgs, tags, license and linked assets are kept. " +
      "The caller must be able to edit the publication.",
  });

export const ImportTargetSchema = z
  .discriminatedUnion("type", [NewImportTargetSchema, DraftImportTargetSchema])
  .openapi("ImportTarget");

export const PostImportBodySchema = z
  .object({
    source: ImportSourceSchema,
    format: ImportFormatSchema.default({ type: "auto" }),
    target: ImportTargetSchema.default({ type: "new" }),
  })
  .openapi("PostImportRequest");
