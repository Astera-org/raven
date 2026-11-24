import { LICENSES } from "#src/db/schema.js";
import { isAuthoritativeDocumentFormat } from "#src/lib/importers/document-formats.js";
import { SlugSchema } from "#v1/lib/schemas/slug.js";
import { z } from "@hono/zod-openapi";
import {
  ContributorsUpdateSchema,
  DoiUpdateSchema,
  ImportDocumentUpdateSchema,
  OrgsUpdateSchema,
  TagsUpdateSchema,
  TitleSchema,
} from "./patch-publication.js";

/** Fields an authoritative document sets, so a create's body can't. */
const DOCUMENT_FIELDS = [
  "title",
  "subtitle",
  "abstract",
  "body",
  "doi",
  "license",
  "tags",
  "contributors",
] as const;

/** A create's fields, whether a client sent them or a document gave them. */
export const CreatePublicationFieldsSchema = z
  .object({
    doi: DoiUpdateSchema.nullable().optional(),
    title: TitleSchema.optional(),
    subtitle: z.string().nullable().optional(),
    abstract: z.string().optional(),
    body: z.string().optional(),
    versionDesc: z.string().optional(),
    license: z.enum(LICENSES).optional(),
    feedbackFormEmbedSrc: z.string().nullable().optional(),
    socialPostsEmbedSrc: z.string().nullable().optional(),
    slug: z
      .string()
      .transform((v) => v.toLowerCase())
      .pipe(SlugSchema)
      .optional()
      .openapi({
        description:
          "Slug for the publication's access URL. Generated from the title " +
          "when omitted.",
      }),
    importDocument: ImportDocumentUpdateSchema.openapi({
      description:
        "The document the draft comes from, stored with it. In an " +
        "authoritative format (`mystmd`, a standard MyST document) the draft's " +
        "fields come from the document: its frontmatter `title`, " +
        "`subtitle`, `abstract`, `license` (an SPDX ID), `keywords` (stored " +
        "as tags), `doi` and `authors` (found by ORCID iD, then email), the " +
        "rest is the body, and none of " +
        `${DOCUMENT_FIELDS.map((f) => `\`${f}\``).join(", ")} may be sent. ` +
        "Without a frontmatter `title`, a leading H1 is the title. A `doi` " +
        "another publication already has is left out with a warning. " +
        "Nobody else is added to the byline, so a draft whose authors " +
        "aren't Stacks users can't be published until someone is. Any other " +
        "format is stored as is.",
      example: {
        format: "mystmd",
        body: "---\ntitle: A study\nlicense: CC-BY-4.0\n---\n\nBody.",
        filename: "paper.md",
      },
    }),
    orgs: OrgsUpdateSchema.optional().openapi({
      description: "Orgs to attach the publication to, in priority order.",
    }),
    tags: TagsUpdateSchema.optional(),
    contributors: ContributorsUpdateSchema.optional().openapi({
      description: "The draft's contributors, in byline order.",
    }),
  })
  .refine(
    (data) =>
      isAuthoritativeDocumentFormat(data.importDocument?.format) ||
      data.title ||
      data.abstract ||
      data.body,
    {
      message: "Missing title, abstract, or body",
      path: ["title"],
    }
  );

export const CreatePublicationBodySchema = CreatePublicationFieldsSchema.refine(
  (data) =>
    !isAuthoritativeDocumentFormat(data.importDocument?.format) ||
    DOCUMENT_FIELDS.every((field) => data[field] === undefined),
  {
    message:
      "An `importDocument` in an authoritative format can't be combined with " +
      `${DOCUMENT_FIELDS.join(", ")}; they come from the document`,
    path: ["importDocument"],
  }
);
export type CreatePublicationBody = z.infer<typeof CreatePublicationBodySchema>;
