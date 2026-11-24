import { type VersionBibliography } from "#src/db/schema.js";
import { MEDIA_IMPORT_IN_PROGRESS_MESSAGE } from "#src/lib/media/constants.js";
import { uploadBodyMediaToS3 } from "#src/lib/media/upload-body-media-to-s3.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { extractAndStoreVersionReferences } from "#src/lib/references.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import {
  type PatchPublicationPermissive,
  PatchPublicationPermissiveSchema,
  type PatchPublicationStrict,
  PatchPublicationStrictSchema,
} from "#v1/routes/publications/route-requests/patch-publication.js";
import { PatchDraftResponseSchema } from "#v1/routes/publications/route-responses/draft.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { z } from "@hono/zod-openapi";
import { type MystFrontmatter } from "@raven/core-import-format";
import type pino from "pino";
import {
  getPublicationResponseAndReadiness,
  getReadiness,
} from "./helpers/get-readiness.js";
import { truncateSubtitle } from "./helpers/truncate-subtitle.js";
import { updateAllContributors } from "./helpers/update-all-contributors.js";
import { updateAllLinkedAssets } from "./helpers/update-all-linked-assets.js";
import { updateAllOrgs } from "./helpers/update-all-orgs.js";
import { updateAllTags } from "./helpers/update-all-tags.js";
import { updatePublication } from "./helpers/update-publication.js";
import { updateVersion } from "./helpers/update-version.js";
import { validateSlug } from "./helpers/validate-slug.js";

export const patchDraftRoute = createAuthedRoute({
  method: "patch",
  path: "/id/{id}/draft",
  tags: ["publications"],
  summary: "Patch a publication's draft",
  description:
    "Applies a partial update to a publication's draft version, identified " +
    "by publication ID. Unlike PUT, this is a true partial update: fields " +
    "omitted from the body are left untouched, while fields explicitly set " +
    'to `null` or `""` are cleared. Fields that fail validation are ' +
    "rejected individually (see `rejected` in the response) rather than " +
    "failing the whole request, so the rest of the patch is still applied. " +
    "The response also reports overall publish-readiness validation " +
    "errors, even when the patch itself succeeds.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
    body: {
      description:
        "Partial set of publication fields to update. A field omitted " +
        'from the body is left untouched; a field set to `null` or `""` ' +
        "is cleared.",
      required: true,
      content: {
        "application/json": {
          /**
           * This is a special case. It's not using the existing zod schema because
           * we want this to be permissive here and let the handler return the errors.
           */
          schema: PatchPublicationPermissiveSchema,
          example: {
            title: "A New Title for the Draft",
            abstract: "An updated summary of the publication's findings.",
            license: "CC BY",
            tags: ["genomics", "open-access"],
          },
        },
      },
    },
  },
  responses: {
    200: {
      description:
        "The patch was applied. Fields that failed validation may have " +
        "been skipped — see `applied` for which fields were written, " +
        "`rejected` for which were skipped and why, and " +
        "`validationErrors` for the publication's overall publish-" +
        "readiness state.",
      content: {
        "application/json": {
          schema: PatchDraftResponseSchema,
        },
      },
    },
    400: {
      description:
        "The publication `body` field could not be persisted, e.g. " +
        "embedded media in the body failed to upload.",
      content: errorContent("mediaAssets"),
    },
    403: {
      description:
        "The authenticated user does not have edit permission on this " +
        "publication.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication exists for the given ID, or its draft version " +
        "could not be found.",
      content: errorContent("publication", "draft"),
    },
  },
});

// True partial update: a field absent from the body is left untouched; a
// field present as `null` or `""` is what gets written. This is unlike PUT
// above, whose schema-parsed values can't distinguish "absent" from
// "explicit null" (e.g. an omitted `title` is treated the same as clearing
// it) — so here presence is always checked against the raw `body` object,
// never inferred from `parsed.data`.
export async function patchDraftHandler(
  c: HandlerContext<typeof patchDraftRoute>
): HandlerReturnType<typeof patchDraftRoute> {
  const id = c.req.valid("param").id;
  const repos = new Repositories();
  const publicationRow = await repos.publications.findById(id);
  /**
   * ------------------------------------------------------
   * Init
   * ------------------------------------------------------
   */
  const user = c.var.user;
  const validationErrors: ValidationIssue[] = [];
  const applied: Array<keyof PatchPublicationStrict> = [];

  /**
   * ------------------------------------------------------
   * Grant/Deny Access
   * ------------------------------------------------------
   */
  if (!publicationRow) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }
  const slug = publicationRow.slug;

  const { id: publicationId, ownerId } = publicationRow;
  if (!(await repos.publications.canEdit(user.id, publicationId, ownerId))) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const draftVersion =
    await repos.versions.findDraftForPublication(publicationId);

  /**
   * @todo - Make a new draft instead of erroring out.
   */
  if (draftVersion == undefined) {
    c.var.logger.error("Failed to get draft");
    return c.json(
      applicationError({
        draft: { message: "Could not find draft for publication" },
      }),
      404
    );
  }
  const draftVersionId = draftVersion.id;

  /**
   * ------------------------------------------------------
   * Parse and Validate Request Body
   * ------------------------------------------------------
   */

  const json = c.req.valid("json");

  const validationIssues: ValidationIssue[] = [];
  const truncated = truncateSubtitle(json?.subtitle);
  if (truncated.warning) {
    validationIssues.push(truncated.warning);
    json.subtitle = truncated.subtitle;
  }

  const parsedBody = PatchPublicationStrictSchema.safeParse(json);

  if (!parsedBody.success) {
    if (json == null || Array.isArray(json) || typeof json !== "object") {
      return c.var.validationErrors(parsedBody.error.issues);
    }
    const readiness = await getReadiness(
      repos,
      publicationId,
      draftVersionId,
      json
    );
    // Return full validation if partial validation fails, just in case.
    if (!readiness.success) {
      validationErrors.push(...readiness.error.issues);
    } else {
      validationErrors.push(...parsedBody.error.issues);
    }
  }

  const {
    slug: newSlug,
    rejection: slugRejection,
    warning: slugWarning,
  } = await validateSlug(slug, json, publicationRow.state);
  if (slugWarning) {
    validationIssues.push(slugWarning);
  }

  if (validationErrors.length > 0 || !parsedBody.success) {
    const version = await repos.versions.findById(draftVersionId);

    if (!version) {
      return c.json(
        applicationError({
          draft: { message: "Could not find draft for publication" },
        }),
        404
      );
    }
  }

  let rejected: Partial<Record<keyof PatchPublicationStrict, ValidationIssue>> =
    {};

  if (!parsedBody.success) {
    for (const issue of parsedBody.error.issues) {
      if (issue.path.length > 0) {
        delete json[String(issue.path[0]) as keyof PatchPublicationPermissive];
        rejected[String(issue.path[0]) as keyof PatchPublicationStrict] = issue;
      }
    }
  }

  if (slugRejection) {
    delete json.slug;
    rejected.slug = slugRejection;
  }

  // The media import worker rewrites the body as uploads finish, so a body
  // saved now could drop its replacements.
  if (
    "body" in json &&
    (await repos.imports.hasUnsettledMediaImport(publicationId))
  ) {
    delete json.body;
    rejected.body = {
      code: "custom",
      path: ["body"],
      message: MEDIA_IMPORT_IN_PROGRESS_MESSAGE,
    };
  }

  const secondParsedBody = PatchPublicationStrictSchema.safeParse(json);

  if (!secondParsedBody.success) {
    return c.var.validationErrors(secondParsedBody.error.issues);
  }

  const updateBody = secondParsedBody.data;

  /**
   * ------------------------------------------------------
   * Update Database
   * ------------------------------------------------------
   */

  // Persisted Media
  let persistedBody = "body" in updateBody ? updateBody.body : null;
  if (persistedBody) {
    try {
      persistedBody =
        (await uploadBodyMediaToS3({
          body: persistedBody,
          publicationId,
          versionId: draftVersionId,
          repos,
        })) ?? persistedBody;
    } catch (e) {
      c.var.logger.error({ err: e }, "Media upload failed");
      return c.json(
        applicationError({ mediaAssets: { message: String(e) } }),
        400
      );
    }
  }

  // Publication Version
  const versionUpdate = await updateVersion(
    draftVersionId,
    { ...updateBody, body: persistedBody },
    updateBody.importDocument
  );
  // Published or deleted while the media uploaded; nothing was written yet.
  if (versionUpdate.status === "not-a-draft") {
    return c.json(
      applicationError({
        draft: { message: "Could not find draft for publication" },
      }),
      404
    );
  }
  applied.push(...versionUpdate.applied);
  if (versionUpdate.bodyRejected) {
    rejected.body = {
      code: "custom",
      path: ["body"],
      message: MEDIA_IMPORT_IN_PROGRESS_MESSAGE,
    };
  }

  // Publication
  // These fields are loosy goosy pre-publication, but are strict after publication
  // because they make LIVE!!! changes.
  /** @todo Prevent live changes to publication states. */
  const { applied: pubApplied, fieldErrors: pubValidationIssues } =
    await updatePublication(
      publicationId,
      {
        ...updateBody,
        slug: newSlug !== slug ? newSlug : undefined,
      },
      publicationRow.state === "PUBLISHED",
      repos
    );
  applied.push(...pubApplied);
  if (pubValidationIssues && Object.values(pubValidationIssues).length > 0) {
    rejected = { ...rejected, ...pubValidationIssues };
  }

  // Contributors
  const [contribsApplied, contribsIssues] = await updateAllContributors(
    draftVersionId,
    updateBody.contributors,
    repos
  );
  if (contribsApplied) {
    applied.push("contributors");
  }
  if (contribsIssues) {
    validationIssues.push(...contribsIssues);
  }

  // Linked Assets
  if (await updateAllLinkedAssets(draftVersionId, updateBody.linkedAssets)) {
    applied.push("linkedAssets");
  }

  // Orgs
  const [orgsApplied, orgsIssues] = await updateAllOrgs(
    publicationId,
    updateBody.orgs
  );
  if (orgsApplied) {
    applied.push("orgs");
  }
  if (orgsIssues.length) {
    validationIssues.push(...orgsIssues);
  }

  // Tags
  if (await updateAllTags(publicationId, updateBody.tags, repos)) {
    applied.push("tags");
  }

  /**
   * ------------------------------------------------------
   * Extract and Store References
   * ------------------------------------------------------
   */

  const logger = c.var.logger;
  if ("abstract" in updateBody || "body" in updateBody) {
    // This is a true partial update - updateBody/persistedBody only reflect
    // the field(s) present in this request. Re-extract from the version's
    // full, just-persisted abstract+body rather than the partial values, or
    // the omitted field's references would be wiped out.
    const savedDraft = await repos.versions.findById(draftVersionId);
    await extractReferences(draftVersion.idInt, savedDraft, logger);
  }

  /**
   * ------------------------------------------------------
   * Return Response
   * ------------------------------------------------------
   */

  const { publication, readiness } = await getPublicationResponseAndReadiness(
    publicationId,
    draftVersionId
  );

  if (publication === undefined) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  return c.json(
    {
      publication,
      applied,
      rejected,
      validationErrors: [
        ...(readiness.success ? [] : readiness.error.issues),
        ...Object.values(rejected),
        ...validationIssues,
      ],
    },
    200
  );
}

/** @todo */
// `extractAndStoreReferences` is a shared legacy utility that still keys
// references by the version's int id internally; that id is never surfaced
// beyond this call.
async function extractReferences(
  versionIdInt: number,
  version:
    | {
        abstract: string | null;
        body: string | null;
        importDocumentFormat: string | null;
        bibliography: VersionBibliography | null;
        frontmatter: MystFrontmatter | null;
      }
    | undefined,
  logger: pino.Logger
) {
  if (version?.abstract || version?.body) {
    await extractAndStoreVersionReferences(versionIdInt, {
      format: version.importDocumentFormat,
      abstract: version.abstract,
      body: version.body,
      bibliography: version.bibliography,
      frontmatter: version.frontmatter,
    }).catch((e) =>
      logger.error({ err: e }, "Failed to extract and store references")
    );
  }
}
