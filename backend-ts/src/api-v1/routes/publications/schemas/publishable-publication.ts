import { PUBLICATION_STATES } from "#src/db/schema.js";
import { markdownToTextSync } from "#src/lib/utils/markdown.js";
import { SlugSchema } from "#v1/lib/schemas/slug.js";
import {
  DoiUpdateSchema,
  LinkedAssetUpdateSchema,
  MAX_SUBTITLE_TEXT_LENGTH,
  OptionalSubtitleSchema,
  TitleSchema,
} from "#v1/routes/publications/route-requests/patch-publication.js";
import { z } from "@hono/zod-openapi";

const contributorInBylineSchema = z.object({
  inByline: z.union([z.boolean(), z.number()]),
});
const BYLINE_ISSUE = {
  message: "At least one contributor must be in the byline",
  path: ["contributors"],
};
const VERSION_DESCRIPTION_ISSUE = {
  message: "Version description required for new versions of a published pub",
  path: ["versionDesc"],
};

/**
 * Validates a fully-assembled publication (draft version + contributors)
 * against the rules required to publish it. Callers compile the object from
 * whatever source they have (DB rows, an in-progress edit, etc.) and pass it
 * through as-is — this schema only knows about the shape, not where it came
 * from, so it can be reused anywhere publish-readiness needs checking.
 */
export const PublishablePublicationSchema = z
  .object({
    slug: SlugSchema,
    title: TitleSchema.min(1, "Missing title"),
    subtitle: OptionalSubtitleSchema.refine(
      (subtitle) =>
        !subtitle ||
        markdownToTextSync(subtitle).length <= MAX_SUBTITLE_TEXT_LENGTH,
      `Subtitle must be ${MAX_SUBTITLE_TEXT_LENGTH} characters or less, not counting formatting`
    ),
    abstract: z.string().nullable(),
    body: z.string().min(1, "Missing body"),
    versionDesc: z.string().nullable(),
    doi: DoiUpdateSchema.nullable(),
    license: z.string().nullable(),
    contributors: z.array(contributorInBylineSchema),
    linkedAssets: LinkedAssetUpdateSchema,
    socialPostsEmbedSrc: z
      .string()
      .startsWith("https://")
      .nullable()
      .optional(),
    feedbackFormEmbedSrc: z
      .string()
      .startsWith("https://")
      .nullable()
      .optional(),
    state: z.enum(PUBLICATION_STATES),
  })
  .refine((data) => data.contributors.some((c) => c.inByline), BYLINE_ISSUE)
  .refine(
    (data) => data.state !== "PUBLISHED" || data.versionDesc,
    VERSION_DESCRIPTION_ISSUE
  );
export type PublishablePublication = z.infer<
  typeof PublishablePublicationSchema
>;
