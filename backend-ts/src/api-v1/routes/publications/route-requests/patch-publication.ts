import { DoiMetadataSubjectSchema, LICENSES } from "#src/db/schema.js";
import { DOI_REGEX } from "#src/lib/datacite/doi-regex.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import { z } from "@hono/zod-openapi";

/** Raw length, markdown included; matches the `versions.subtitle` column. */
export const MAX_SUBTITLE_LENGTH = 300;
/** Visible length once markdown is stripped; enforced when publishing. */
export const MAX_SUBTITLE_TEXT_LENGTH = 280;
const MAX_TITLE_LENGTH = 255;
/** Matches the `publication_tags.tag` column. */
export const MAX_TAG_LENGTH = 255;

export const DoiUpdateSchema = z
  .string()
  .max(255, "DOI must be 255 characters or less")
  .regex(DOI_REGEX, "DOI format is invalid");
export type DoiUpdate = z.infer<typeof DoiUpdateSchema>;

export const ContributorUpdateItemSchema = z.object({
  userId: ulidSchema({ fieldName: "userId" }),
  roles: z.array(z.string().min(1)),
  inByline: z.boolean(),
  affiliations: z.array(ulidSchema({ fieldName: "affiliations" })),
});
export type ContributorUpdateItem = z.infer<typeof ContributorUpdateItemSchema>;
export const ContributorsUpdateSchema = z.array(ContributorUpdateItemSchema);
export type ContributorsUpdate = z.infer<typeof ContributorsUpdateSchema>;

export const ImportDocumentUpdateSchema = z
  .object({
    body: z.string(),
    url: z.url().nullable().optional(),
    format: z.string(),
    filename: z.string().nullable().optional(),
  })
  .nullable()
  .optional();
export type ImportDocumentUpdate = z.infer<typeof ImportDocumentUpdateSchema>;

export const LinkedAssetUpdateSchema = z.array(
  z.object({
    type: z.string().optional().default(""),
    url: z.url().optional().default(""),
    name: z.string().optional().default(""),
  }),
  {
    error: "Invalid input: expected a list of assets",
  }
);
export type LinkedUpdateAsset = z.infer<typeof LinkedAssetUpdateSchema>;

export const OptionalSubtitleSchema = z
  .string()
  .max(
    MAX_SUBTITLE_LENGTH,
    `Subtitle must be ${MAX_SUBTITLE_LENGTH} characters or less`
  )
  .nullable()
  .optional();

export const OrgsUpdateSchema = z.array(
  z
    .object({
      orgId: ulidSchema({ fieldName: "orgId" }).optional(),
      orgSlug: z.string().min(1).optional(),
    })
    .refine(
      (org) => (org.orgId === undefined) !== (org.orgSlug === undefined),
      "Give exactly one of orgId or orgSlug"
    )
    .openapi({
      description: "An organization, by ID or by slug: exactly one of the two.",
    })
);
export type OrgsUpdate = z.infer<typeof OrgsUpdateSchema>;

export const TagsUpdateSchema = z.array(z.string(), {
  error: "Invalid tags format. Expected a list.",
});
export type TagUpdate = z.infer<typeof TagsUpdateSchema>;

export const TitleSchema = z
  .string()
  .max(
    MAX_TITLE_LENGTH,
    `Title must be ${MAX_TITLE_LENGTH} characters or less`
  );

export const PatchPublicationPermissiveSchema = z.object({
  abstract: z.string().nullable().optional(),
  body: z.string().optional(),
  contributors: ContributorsUpdateSchema.optional(),
  feedbackFormEmbedSrc: z
    .string()
    .nullable()
    .optional()
    .openapi({ format: "uri" }),
  importDocument: z
    .object({
      body: z.string(),
      url: z.string().openapi({ format: "uri" }),
      format: z.string(),
      filename: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  license: z
    .string()
    .optional()
    .openapi({ enum: [...LICENSES] }),
  linkedAssets: z
    .array(
      z.object({
        type: z.string().optional().default(""),
        url: z.url().optional().default("").openapi({ format: "uri" }),
        name: z.string().optional().default(""),
      })
    )
    .optional(),
  orgs: OrgsUpdateSchema.optional().openapi({
    description:
      "A full list of the organizations associated with the publication." +
      "This list will fully replace all existing associated orgs.",
  }),
  slug: z
    .string()
    .optional()
    .openapi({
      maxLength: 255,
      minLength: 12,
      description:
        "Slug for the access URL for the publication, e.g. " +
        "https://thestacks.org/publications/{slug}. If another " +
        "publication already uses the slug, the first free variant " +
        "(`{slug}-2`, `{slug}-3`, ...) is stored instead and reported in " +
        "`validationErrors` with code `slug_replaced`.",
    }),
  socialPostsEmbedSrc: z
    .string()
    .nullable()
    .optional()
    .openapi({ format: "uri" }),
  subjects: z
    .array(DoiMetadataSubjectSchema)
    .optional()
    .openapi({
      description:
        "The DataCite subjects for the publication's DOIs, as a full list " +
        "that replaces the stored one; the rest of its DOI metadata is " +
        "left untouched. Needs at least one subject, each non-empty. " +
        "Rejected once the publication is published. DataCite receives " +
        "them the next time one of the publication's DOIs is minted or " +
        "updated.",
    }),
  subtitle: z
    .string()
    .nullable()
    .optional()
    .openapi({
      maxLength: MAX_SUBTITLE_LENGTH,
      description:
        `Markdown. Longer than ${MAX_SUBTITLE_LENGTH} characters is ` +
        "truncated on save. Publishing also requires at most " +
        `${MAX_SUBTITLE_TEXT_LENGTH} characters once markdown is stripped; ` +
        "a longer subtitle is reported in `validationErrors`.",
    }),
  tags: TagsUpdateSchema.optional(),
  title: z.string().optional().openapi({ maxLength: 255 }),
  versionDesc: z.string().nullable().optional(),
});
export type PatchPublicationPermissive = z.infer<
  typeof PatchPublicationPermissiveSchema
>;

/**
 * The point here is to be very permissive. The schema is just for validating the shape
 * of the request body, not enforcing the rules. When updating a draft it is on key
 * strokes and such so we want to the user to save their progress as is even if it is
 * not publishable yet. The publishablePublicationSchema is used to validate the
 * publication when the user tries to publish it, and we return the validation errors
 * with a 200 when the user updates a draft anyway.
 */
export const PatchPublicationStrictSchema = z.object({
  abstract: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  contributors: ContributorsUpdateSchema.optional(),
  feedbackFormEmbedSrc: z.string().nullable().optional(),
  importDocument: ImportDocumentUpdateSchema,
  license: z.enum(LICENSES).optional(),
  linkedAssets: LinkedAssetUpdateSchema.optional(),
  orgs: OrgsUpdateSchema.optional(),
  socialPostsEmbedSrc: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  // At least one, like the stored DOI metadata, which a DOI mint would
  // otherwise fail to parse.
  subjects: z.array(DoiMetadataSubjectSchema).min(1).optional(),
  subtitle: OptionalSubtitleSchema,
  tags: TagsUpdateSchema.optional(),
  title: TitleSchema.nullable().optional(),
  versionDesc: z.string().nullable().optional(),
});
export type PatchPublicationStrict = z.infer<
  typeof PatchPublicationStrictSchema
>;
