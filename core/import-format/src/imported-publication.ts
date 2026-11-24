import { z } from "zod";
import { ImportDiagnosticSchema } from "./import-diagnostic.js";
import { isMediaRef } from "./media-ref.js";

export const TEXT_MAX_BYTES = 65_535;
export const MEDIUMTEXT_MAX_BYTES = 16_777_215;
export const MEDIUMBLOB_MAX_BYTES = 16_777_215;
const MEDIA_TOO_LARGE = `Media must be at most ${MEDIUMBLOB_MAX_BYTES} bytes`;

/** `.refine()` arguments capping a string's UTF-8 size in bytes. */
const maxBytes = (max: number) =>
  [
    (val: string) => new TextEncoder().encode(val).byteLength <= max,
    { message: `String must be at most ${max} bytes long` },
  ] as const;

/** Must match `LICENSES` in backend-ts's db schema; the backend asserts this. */
export const IMPORT_LICENSES = [
  "CC BY",
  "CC BY-SA",
  "CC BY-ND",
  "CC BY-NC",
  "CC BY-NC-SA",
  "CC BY-NC-ND",
  "CC0",
] as const;
export type ImportLicense = (typeof IMPORT_LICENSES)[number];

export const TAG_MAX_LENGTH = 255;

export const FIGURE_TYPES = ["audio", "iframe", "image", "video"] as const;
export const FigureTypeSchema = z.enum(FIGURE_TYPES);
export type FigureType = z.infer<typeof FigureTypeSchema>;

/**
 * Importers can't know Raven's internal ids, so people and orgs are referenced
 * by any identifier the source document is likely to carry. Raven resolves
 * them to existing records and reports the ones it can't find.
 */
export const UserRefSchema = z.object({
  by: z.enum(["orcid", "email", "fullname"]),
  value: z.string().min(1),
});
export type UserRef = z.infer<typeof UserRefSchema>;

export const OrgRefSchema = z.object({
  by: z.enum(["rorId", "name"]),
  value: z.string().min(1),
});
export type OrgRef = z.infer<typeof OrgRefSchema>;

export const ImportedContributorSchema = z.object({
  /** Tried in order until one resolves. */
  user: z.array(UserRefSchema).min(1),
  /** Only used to describe the contributor when `user` can't be resolved. */
  displayName: z.string().optional(),
  /** As the document names them; Raven maps them to its own roles. */
  roles: z.array(z.string().min(1).max(255)).default([]),
  inByline: z.boolean().default(true),
  affiliations: z.array(OrgRefSchema).default([]),
});
export type ImportedContributor = z.infer<typeof ImportedContributorSchema>;

export const ImportedLinkedAssetSchema = z.object({
  type: z.string().min(1).max(255),
  url: z.url().max(512),
  name: z.string().max(255).nullable().default(null),
});
export type ImportedLinkedAsset = z.infer<typeof ImportedLinkedAssetSchema>;

/**
 * The size of a `data:` URL's content once decoded, worked out from its length
 * so it never has to be decoded here.
 */
function dataUrlByteLength(url: string): number {
  const comma = url.indexOf(",");
  const payload = url.slice(comma + 1);
  if (!url.slice(0, comma).endsWith(";base64")) return payload.length;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export const ImportedUrlMediaSourceSchema = z.object({
  type: z.literal("url"),
  // Raven decodes `data:` URLs into bytes when it queues the media, so they're
  // limited by the size of their content, like `bytes` sources, rather than by
  // the URL length limit.
  url: z.url().superRefine((url, ctx) => {
    if (url.startsWith("data:")) {
      if (dataUrlByteLength(url) > MEDIUMBLOB_MAX_BYTES) {
        ctx.addIssue({ code: "custom", message: MEDIA_TOO_LARGE });
      }
      return;
    }
    if (new TextEncoder().encode(url).byteLength > TEXT_MAX_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `URL must be at most ${TEXT_MAX_BYTES} bytes long`,
      });
    }
  }),
});

export const ImportedFileMediaSourceSchema = z.object({
  type: z.literal("bytes"),
  data: z
    .instanceof(Uint8Array)
    .refine((data) => data.byteLength <= MEDIUMBLOB_MAX_BYTES, MEDIA_TOO_LARGE),
  filename: z
    .string()
    .min(1)
    .max(TEXT_MAX_BYTES)
    .refine(...maxBytes(TEXT_MAX_BYTES)),
  mimeType: z.string().optional(),
});

export const ImportedMediaSourceSchema = z.discriminatedUnion("type", [
  ImportedUrlMediaSourceSchema,
  ImportedFileMediaSourceSchema,
]);
export type ImportedMediaSource = z.infer<typeof ImportedMediaSourceSchema>;

const importedMedia = <T>(source: T) =>
  z.object({
    ref: z.string().refine(isMediaRef, {
      message: "Must be built with mediaRef()",
    }),
    source,
    figureType: FigureTypeSchema,
  });

/**
 * Media embedded in the body. `ref` is a placeholder built with `mediaRef()`
 * that appears in `version.body` wherever the media is used; Raven uploads the
 * media and replaces every occurrence with its public URL.
 */
export const ImportedMediaSchema = importedMedia(ImportedMediaSourceSchema);
export type ImportedMedia = z.infer<typeof ImportedMediaSchema>;
export const ImportedUrlMediaSchema = importedMedia(
  ImportedUrlMediaSourceSchema
);
export type ImportedUrlMedia = z.infer<typeof ImportedUrlMediaSchema>;
export const ImportedFileMediaSchema = importedMedia(
  ImportedFileMediaSourceSchema
);
export type ImportedFileMedia = z.infer<typeof ImportedFileMediaSchema>;

/** The original document, kept so the version can be re-synced later. */
export const ImportDocumentSchema = z.object({
  /** Simplest name for the format, e.g. `gdoc`, `html`, `mystmd`; not a mime type. */
  format: z.string().min(1).max(255),
  body: z
    .string()
    .max(MEDIUMTEXT_MAX_BYTES)
    .refine(
      (val) => new TextEncoder().encode(val).byteLength <= MEDIUMTEXT_MAX_BYTES,
      { message: `String must be at most ${MEDIUMTEXT_MAX_BYTES} bytes long` }
    ),
  url: z
    .url()
    .max(TEXT_MAX_BYTES)
    .refine(...maxBytes(TEXT_MAX_BYTES))
    .nullable()
    .default(null),
  filename: z
    .string()
    .max(TEXT_MAX_BYTES)
    .refine(...maxBytes(TEXT_MAX_BYTES))
    .nullable()
    .default(null),
});
export type ImportDocument = z.infer<typeof ImportDocumentSchema>;

export const ImportedPublicationFieldsSchema = z.object({
  slug: z.string().min(1).max(255).optional(),
  doi: z.string().max(255).nullable().default(null),
  /** Omitted when the document doesn't say, so Raven can keep the current one. */
  license: z.enum(IMPORT_LICENSES).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
  feedbackFormEmbedSrc: z
    .string()
    .max(TEXT_MAX_BYTES)
    .refine(...maxBytes(TEXT_MAX_BYTES))
    .nullable()
    .default(null),
  socialPostsEmbedSrc: z
    .string()
    .max(TEXT_MAX_BYTES)
    .refine(...maxBytes(TEXT_MAX_BYTES))
    .nullable()
    .default(null),
  tags: z.array(z.string().min(1).max(TAG_MAX_LENGTH)).default([]),
  orgs: z.array(OrgRefSchema).default([]),
});

/**
 * MyST frontmatter that changes how a version renders but has no field of its
 * own, in the form `myst-frontmatter` validates it to: `numbering` turns on
 * numbered headings and other targets, `math` defines LaTeX macros.
 */
export const MystFrontmatterSchema = z.object({
  numbering: z.record(z.string(), z.unknown()).optional(),
  math: z.record(z.string(), z.looseObject({ macro: z.string() })).optional(),
});
export type MystFrontmatter = z.infer<typeof MystFrontmatterSchema>;

export const ImportedVersionFieldsSchema = z.object({
  /** Null when the document has none; publishing needs one. */
  title: z.string().min(1).max(255).nullable().default(null),
  subtitle: z.string().max(300).nullable().default(null),
  abstract: z
    .string()
    .max(TEXT_MAX_BYTES)
    .nullable()
    .default(null)
    .refine(
      (val) =>
        val ? new TextEncoder().encode(val).byteLength <= TEXT_MAX_BYTES : true,
      { message: `String must be at most ${TEXT_MAX_BYTES} bytes long` }
    ),
  /** MyST markdown. */
  body: z
    .string()
    .max(MEDIUMTEXT_MAX_BYTES)
    .refine(
      (val) => new TextEncoder().encode(val).byteLength <= MEDIUMTEXT_MAX_BYTES,
      { message: `String must be at most ${MEDIUMTEXT_MAX_BYTES} bytes long` }
    ),
  versionDesc: z
    .string()
    .max(TEXT_MAX_BYTES)
    .refine(...maxBytes(TEXT_MAX_BYTES))
    .nullable()
    .default(null),
  doi: z.string().max(255).nullable().default(null),
  /** Null when the document sets none, and for formats other than MyST. */
  frontmatter: MystFrontmatterSchema.nullable().default(null),
});
export type ImportedVersionFields = z.infer<typeof ImportedVersionFieldsSchema>;

/**
 * The standard result of every importer: everything Raven needs to create a
 * draft publication and its first version.
 */
export const ImportedPublicationSchema = z
  .object({
    publication: ImportedPublicationFieldsSchema.prefault({}),
    version: ImportedVersionFieldsSchema,
    importDocument: ImportDocumentSchema,
    contributors: z.array(ImportedContributorSchema).default([]),
    linkedAssets: z.array(ImportedLinkedAssetSchema).default([]),
    media: z.array(ImportedMediaSchema).default([]),
    /** Non-fatal problems the importer wants surfaced to the user. */
    diagnostics: z.array(ImportDiagnosticSchema).default([]),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.media.forEach(({ ref }, i) => {
      if (seen.has(ref)) {
        ctx.addIssue({
          code: "custom",
          path: ["media", i, "ref"],
          message: `Duplicate media ref "${ref}"`,
        });
      }
      seen.add(ref);
    });
  });

/** What an importer returns; fields with defaults may be omitted. */
export type ImportedPublicationInput = z.input<
  typeof ImportedPublicationSchema
>;
/** What Raven receives after validating an importer's result. */
export type ImportedPublication = z.output<typeof ImportedPublicationSchema>;
