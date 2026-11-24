import { createVersionImport } from "#src/lib/importers/create-version-import.js";
import { isAuthoritativeDocumentFormat } from "#src/lib/importers/document-formats.js";
import { logger } from "#src/lib/logger.js";
import { uploadBodyMediaToS3 } from "#src/lib/media/upload-body-media-to-s3.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { resolveOrgs } from "#src/lib/publications/resolve-orgs.js";
import { extractAndStoreVersionReferences } from "#src/lib/references.js";
import { isDuplicateEntryError } from "#src/lib/utils/db-errors.js";
import { generateSlug } from "#src/lib/utils/generate-slug.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { type Links } from "#v1/lib/route-responses/links.js";
import {
  type CreatePublicationBody,
  CreatePublicationFieldsSchema,
} from "#v1/routes/publications/route-requests/post-publications.js";
import { type MystFrontmatter } from "@raven/core-import-format";
import { ulid } from "ulid";
import { loadDraftEtag } from "./draft-etag.js";
import { draftIssues } from "./draft-issues.js";
import { draftLinks } from "./draft-links.js";
import { getReadiness } from "./get-readiness.js";
import { truncateSubtitle } from "./truncate-subtitle.js";
import { updateAllContributors } from "./update-all-contributors.js";
import { orgLookups, updateAllOrgs } from "./update-all-orgs.js";
import { updateAllTags } from "./update-all-tags.js";

class MediaUploadError extends Error {}

export interface CreatePublicationOptions {
  ownerId: string;
  /** A MyST document's `numbering` and `math`, which no request field sets. */
  frontmatter?: MystFrontmatter | null;
}

export type CreatePublicationResult =
  | { status: "invalid"; issues: ValidationIssue[] }
  | { status: "error"; error: string; code: 400 }
  | {
      status: "created";
      created: {
        publicationId: string;
        slug: string;
        versionId: string;
        validationErrors: ValidationIssue[];
        links: Links;
      };
      etag: string;
    };

export async function createPublication(
  body: CreatePublicationBody,
  options: CreatePublicationOptions
): Promise<CreatePublicationResult> {
  const { ownerId, frontmatter = null } = options;
  const repos = new Repositories();
  const validationErrors: ValidationIssue[] = [];

  const warnings: ValidationIssue[] = [];
  const truncated = truncateSubtitle(body?.subtitle);
  if (truncated.warning) {
    warnings.push(truncated.warning);
    body.subtitle = truncated.subtitle;
  }

  const parsed = CreatePublicationFieldsSchema.safeParse(body);
  if (!parsed.success) {
    validationErrors.push(...parsed.error.issues);
  }

  const pubUlid = ulid();
  const providedSlug =
    typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : undefined;
  const providedTitle =
    typeof body?.title === "string" ? body.title : undefined;
  const slug =
    providedSlug ||
    (providedTitle ? generateSlug(providedTitle, pubUlid) : null);

  if (!slug) {
    validationErrors.push({
      path: ["slug"],
      message: "Slug or title must be a non-empty string",
    });
    return { status: "invalid", issues: validationErrors };
  }

  if (await repos.publications.findBySlug(slug)) {
    validationErrors.push({
      code: "custom",
      path: ["slug"],
      message: "Slug already exists",
    });
  }

  if (validationErrors.length !== 0 || !parsed.success) {
    return { status: "invalid", issues: validationErrors };
  }

  const resolvedOrgs = await resolveOrgs(
    repos,
    orgLookups(parsed.data.orgs ?? []),
    { path: ["orgs"] }
  );
  if (resolvedOrgs.issues.length > 0) {
    return { status: "invalid", issues: resolvedOrgs.issues };
  }

  const {
    doi,
    title,
    subtitle,
    abstract,
    body: bodyText,
    versionDesc,
    feedbackFormEmbedSrc,
    socialPostsEmbedSrc,
    importDocument,
    tags,
    contributors,
  } = parsed.data;
  const license = parsed.data.license ?? "CC BY";

  let uploadedBody = bodyText;
  const versionUlid = ulid();
  try {
    await repos.transaction(async (repos) => {
      await repos.publications.create({
        id: pubUlid,
        slug,
        doi: doi ?? null,
        ownerId,
        license,
        feedbackFormEmbedSrc: feedbackFormEmbedSrc ?? null,
        socialPostsEmbedSrc: socialPostsEmbedSrc ?? null,
      });
      await repos.versions.create({
        id: versionUlid,
        publicationId: pubUlid,
        publicationIdInt: null,
        title: title ?? null,
        subtitle: subtitle ?? null,
        abstract: abstract ?? null,
        body: uploadedBody ?? null,
        frontmatter,
        versionDesc: versionDesc ?? null,
        importDocumentBody: importDocument?.body ?? null,
        importDocumentUrl: importDocument?.url ?? null,
        importDocumentFilename: importDocument?.filename ?? null,
        importDocumentFormat: importDocument?.format ?? null,
        importDocumentSyncDate: importDocument ? new Date() : null,
      });
      if (importDocument) {
        await createVersionImport(repos, {
          versionId: versionUlid,
          format: importDocument.format,
          url: importDocument.url ?? null,
          filename: importDocument.filename ?? null,
          body: importDocument.body,
        });
      }
      if (isAuthoritativeDocumentFormat(importDocument?.format)) return;

      try {
        uploadedBody =
          (await uploadBodyMediaToS3({
            body: bodyText,
            publicationId: pubUlid,
            versionId: versionUlid,
            repos,
          })) ?? uploadedBody;
      } catch (e) {
        throw new MediaUploadError(String(e), { cause: e });
      }

      /**
       * In order to insert into version_media_asset_map, the version
       * needs to have already been persisted, otherwise there's an Foreign
       * Key error.
       *
       * But since uploading the media updates the body, we need to update
       * it in the database here.
       */
      await repos.versions.update(versionUlid, {
        body: uploadedBody ?? null,
      });
    });
  } catch (e) {
    if (isDuplicateEntryError(e, "publications_doi_unique")) {
      return {
        status: "invalid",
        issues: [
          {
            code: "custom",
            path: ["doi"],
            message: "DOI is already in use by another publication",
          },
        ],
      };
    }
    if (!(e instanceof MediaUploadError)) throw e;
    logger.error({ err: e.cause }, "Media upload failed");
    return { status: "error", error: e.message, code: 400 };
  }

  if (contributors && contributors.length > 0) {
    const [, contributorIssues] = await updateAllContributors(
      versionUlid,
      contributors,
      repos
    );
    warnings.push(...contributorIssues);
  }
  if (tags && tags.length > 0) {
    await updateAllTags(pubUlid, tags, repos);
  }
  if (resolvedOrgs.orgIds.length > 0) {
    const [, orgIssues] = await updateAllOrgs(
      pubUlid,
      resolvedOrgs.orgIds.map((orgId) => ({ orgId }))
    );
    warnings.push(...orgIssues);
  }

  const version = await repos.versions.findById(versionUlid);
  extractAndStoreVersionReferences(version!.idInt, {
    format: importDocument?.format,
    abstract,
    body: uploadedBody,
    // A create has no bibliography yet: the CLI sends one after this.
    bibliography: version!.bibliography,
    frontmatter,
  }).catch((e) =>
    logger.error({ err: e }, "Failed to extract and store references")
  );

  const readiness = await getReadiness(repos, pubUlid, versionUlid);

  return {
    status: "created",
    created: {
      publicationId: pubUlid,
      slug,
      versionId: versionUlid,
      validationErrors: draftIssues(readiness.error?.issues ?? [], warnings),
      links: draftLinks(pubUlid),
    },
    etag: await loadDraftEtag(repos, { id: pubUlid, license }, version!),
  };
}
