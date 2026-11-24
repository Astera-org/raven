import {
  DoiMetadataSubjectSchema,
  IMPORTED_VERSION_FIELDS,
  MEDIA_ASSET_TYPES,
  PUBLICATION_STATES,
} from "#src/db/schema.js";
import { z } from "@hono/zod-openapi";
import { ImportDiagnosticSchema } from "@raven/core-import-format";
import { PublicationBibliographyResponseSchema } from "./bibliography.js";

const zStrNull = z.string().nullable();

const ContributorAffiliationResponseSchema = z.object({
  orgId: z.string(),
  name: z.string(),
  slug: z.string(),
  rorId: zStrNull,
  avatar: zStrNull,
});
export type ContributorAffiliationResponse = z.infer<
  typeof ContributorAffiliationResponseSchema
>;

export const ContributorResponseSchema = z.object({
  userId: z.string(),
  roles: z.array(z.string()),
  firstName: zStrNull,
  lastName: zStrNull,
  avatar: zStrNull,
  inByline: z.boolean().nullable(),
  priority: z.number().nullable(),
  affiliations: z.array(ContributorAffiliationResponseSchema),
});
export type ContributorResponse = z.infer<typeof ContributorResponseSchema>;

const VersionImportDocumentResponseSchema = z.object({
  id: z.string(),
  url: zStrNull.openapi({
    description:
      "Where the document was fetched from; null when a client sent it, as " +
      "with MyST.",
  }),
  format: z.string(),
  filename: zStrNull,
  syncDate: z.string(),
});
export type VersionImportDocumentResponse = z.infer<
  typeof VersionImportDocumentResponseSchema
>;

const ImportDocumentResponseSchema = VersionImportDocumentResponseSchema.extend(
  {
    /** Only on the draft; null elsewhere. */
    diagnostics: z.array(ImportDiagnosticSchema).nullable(),
    editedFields: z
      .array(z.enum(IMPORTED_VERSION_FIELDS))
      .nullable()
      .openapi({
        description:
          "Fields changed by a draft edit since this import, so they no " +
          "longer match the source document. Empty after an import or " +
          "re-sync. Only on the draft; null elsewhere.",
      }),
  }
);
export type ImportDocumentResponse = z.infer<
  typeof ImportDocumentResponseSchema
>;

const MediaAssetSchema = z.object({
  id: z.string(),
  byteSize: z.int(),
  mimeType: z.string(),
  kind: z.enum(MEDIA_ASSET_TYPES),
  publicUrl: z.string(),
  width: z.int().nullable(),
  height: z.int().nullable(),
  durationMs: z.number().nullable(),
  rotation: z.int().nullable(),
});

const ContentResponseSchema = z
  .object({
    format: z.string().openapi({
      description:
        "`myst` for MyST content, which clients render from the MyST AST; " +
        "`gdoc` for the Google Docs format.",
    }),
  })
  .openapi({
    description:
      "The format of the version's content, which tells clients how to " +
      "render it. Absent when the version has no recorded format.",
  });
export type ContentResponse = z.infer<typeof ContentResponseSchema>;

const LinkedAssetResponseSchema = z.object({
  type: z.string(),
  url: z.string(),
  name: zStrNull,
});
export type LinkedAssetResponse = z.infer<typeof LinkedAssetResponseSchema>;

const PublicationStatsSchema = z.object({
  sections: z.int(),
  audio: z.int(),
  images: z.int(),
  videos: z.int(),
  iframes: z.int(),
  tables: z.int(),
  citations: z.int(),
});
export type PublicationStats = z.infer<typeof PublicationStatsSchema>;

const VersionListItemResponseSchema = z.object({
  id: z.string(),
  versionNumber: z.number(),
  versionDesc: zStrNull,
  doi: zStrNull,
  createdAt: z.string(),
  /**
   * The version's current import, on the draft only (null elsewhere), so the
   * editor can show the doc an earlier version was synced from.
   */
  importDocument: VersionImportDocumentResponseSchema.nullable(),
});
export type VersionListItemResponse = z.infer<
  typeof VersionListItemResponseSchema
>;

export const PublicationResponseSchema = z.object({
  abstract: zStrNull,
  body: zStrNull,
  contributors: z.array(ContributorResponseSchema),
  createdAt: zStrNull,
  doi: zStrNull,
  versionDoi: zStrNull,
  id: z.string(),
  license: zStrNull,
  linkedAssets: z.array(LinkedAssetResponseSchema),
  orgs: z.array(
    z.object({
      orgId: z.string(),
      priority: z.number(),
      slug: z.string(),
      name: z.string(),
      avatar: zStrNull,
    })
  ),
  pdfUrl: zStrNull,
  publisher: z.string(),
  references: z.array(z.object({ url: zStrNull, text: zStrNull })),
  slug: z.string(),
  feedbackFormEmbedSrc: zStrNull,
  socialPostsCount: z.number().nullable(),
  socialPostsEmbedSrc: zStrNull,
  state: z.string(),
  stats: PublicationStatsSchema,
  subtitle: zStrNull,
  tags: z.array(z.string()),
  title: zStrNull,
  versionDesc: zStrNull,
  versionNumber: z.number(),
  versionState: z.enum(PUBLICATION_STATES).openapi({
    description:
      "The state of this version. `DRAFT` when the response is a draft, which only its editors can read.",
  }),
  versions: z.array(VersionListItemResponseSchema),
  mediaAssets: z.array(MediaAssetSchema),
  importDocument: ImportDocumentResponseSchema.optional(),
  content: ContentResponseSchema.optional(),
  bibliography: PublicationBibliographyResponseSchema.optional().openapi({
    description:
      "The version's own BibTeX files and the entries its document cites. " +
      "Absent for a version without a bibliography.",
  }),
});

export type PublicationResponse = z.infer<typeof PublicationResponseSchema>;

export const DraftPublicationResponseSchema = PublicationResponseSchema.extend({
  subjects: z.array(DoiMetadataSubjectSchema).openapi({
    description:
      "The DataCite subjects stored for the publication's DOIs, which " +
      "`PATCH .../id/{id}/draft` sets.",
  }),
});

export type DraftPublicationResponse = z.infer<
  typeof DraftPublicationResponseSchema
>;

export const GetPublicationResponseSchema = z.object({
  publication: PublicationResponseSchema,
});
