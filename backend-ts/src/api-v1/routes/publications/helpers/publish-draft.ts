import {
  mintDoiForNewVersion,
  mintDoisForNewPub,
  publishDraftDois,
  setDoisFindable,
} from "#src/lib/datacite/client.js";
import { isMystContent } from "#src/lib/importers/document-formats.js";
import { logger } from "#src/lib/logger.js";
import {
  MEDIA_IMPORT_IN_PROGRESS_MESSAGE,
  UNRESOLVED_MEDIA_REF_MESSAGE,
} from "#src/lib/media/constants.js";
import { uploadBodyMediaToS3 } from "#src/lib/media/upload-body-media-to-s3.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import {
  DoiLockTimeoutError,
  withPublicationDoiLock,
} from "#src/lib/publication-doi-lock.js";
import { extractAndStoreVersionReferences } from "#src/lib/references.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { notifyForNewPublication } from "#v1/lib/notifications-logic.js";
import { type PublishedVersionResponse } from "#v1/routes/publications/route-responses/published-version.js";
import { z } from "@hono/zod-openapi";
import { containsMediaRef } from "@raven/core-import-format";
import type pino from "pino";
import { getReadiness } from "./get-readiness.js";
import { triggerPdfGeneration } from "./trigger-pdf-generation.js";

const DRAFT_NOT_FOUND = {
  status: "error",
  code: 404,
  errors: { draft: { message: "No draft found" } },
} as const;

type PublishDraftResult =
  | { status: "published"; published: PublishedVersionResponse }
  | { status: "invalid"; issues: ValidationIssue[] }
  | { status: "error"; code: 400; errors: { mediaAssets: { message: string } } }
  | { status: "error"; code: 403; errors: { auth: { message: string } } }
  | {
      status: "error";
      code: 404;
      errors:
        { publication: { message: string } } | { draft: { message: string } };
    };

/**
 * Promotes a publication's draft to PUBLISHED, minting or updating its DOIs
 * when one of its orgs has minting enabled.
 */
export async function publishDraft({
  id,
  userId,
  note,
  requestLogger,
}: {
  id: string;
  userId: string;
  note: string | null | undefined;
  requestLogger: pino.Logger;
}): Promise<PublishDraftResult> {
  const repos = new Repositories();
  const publication = await repos.publications.findById(id);
  if (!publication) {
    return {
      status: "error",
      code: 404,
      errors: { publication: { message: "Publication not found" } },
    };
  }

  // Checked before fetching the draft, so a caller without publish rights
  // always gets 403 rather than learning whether a draft exists first.
  if (
    !(await repos.publications.canPublish(
      userId,
      publication.id,
      publication.ownerId
    ))
  ) {
    return {
      status: "error",
      code: 403,
      errors: { auth: { message: "Permission denied" } },
    };
  }

  const draftId = await repos.versions.findDraftIdByPubId(publication.id);
  if (!draftId) return DRAFT_NOT_FOUND;

  // Take the publication lock first, as the MyST content, bibliography and
  // media handlers do before resolving the draft. Keep this order to avoid
  // deadlocks with draft writes. Hold the draft lock through publish so
  // version-only writers can't change it after validation.
  const committed = await repos.transaction(async (repos) => {
    await repos.publications.findForUpdate(publication.id);
    const version = await repos.versions.findForUpdate(draftId);
    // Another publish may have finished while we waited for the lock.
    if (version?.state !== "DRAFT") return DRAFT_NOT_FOUND;

    const versionDesc = z.string().min(1).safeParse(note).success
      ? (note as string)
      : version.versionDesc;

    const validationErrors: ValidationIssue[] = [];
    if (
      (versionDesc == null || versionDesc.length === 0) &&
      version.versionNumber !== 1
    ) {
      validationErrors.push({
        code: "custom",
        path: ["note"],
        message: "A version description is required for publication edits",
      });
    }

    // Publishing rewrites the body, which would race the media import worker.
    if (await repos.imports.hasUnsettledMediaImport(publication.id)) {
      validationErrors.push({
        code: "custom",
        path: ["body"],
        message: MEDIA_IMPORT_IN_PROGRESS_MESSAGE,
      });
    } else if (containsMediaRef(version.body ?? "")) {
      validationErrors.push({
        code: "custom",
        path: ["body"],
        message: UNRESOLVED_MEDIA_REF_MESSAGE,
      });
    }

    await repos.versions.update(version.id, { versionDesc });

    const readiness = await getReadiness(repos, publication.id, version.id);
    if (!readiness.success) {
      validationErrors.push(...readiness.error.issues);
    }

    if (validationErrors.length !== 0) {
      return { status: "invalid", issues: validationErrors } as const;
    }

    let uploadedBody = version.body;
    try {
      uploadedBody =
        (await uploadBodyMediaToS3({
          body: version.body,
          publicationId: publication.id,
          versionId: version.id,
          repos,
        })) ?? uploadedBody;
    } catch (e) {
      requestLogger.error({ err: e }, "Media upload failed");
      return {
        status: "error",
        code: 400,
        errors: { mediaAssets: { message: String(e) } },
      } as const;
    }

    const now = new Date();
    // Both rows below should carry the exact same publish timestamp.
    const publishedAt = now.toISOString().slice(0, 23).replace("T", " ");

    await repos.versions.update(version.id, {
      body: uploadedBody,
      state: "PUBLISHED",
      versionDesc,
      createdAt: publishedAt,
    });
    await repos.publications.update(publication.id, {
      latestVersionNumber: version.versionNumber,
      ...(version.versionNumber === 1 ? { createdAt: publishedAt } : {}),
    });
    await repos.publications.updateState(publication.id, "PUBLISHED");
    return {
      status: "committed" as const,
      version,
      versionDesc,
      uploadedBody,
      publishDate: now.toISOString().slice(0, 10),
    };
  });
  if (committed.status !== "committed") return committed;
  const { version, versionDesc, uploadedBody, publishDate } = committed;

  let canonicalDoi = publication.doi;
  let versionDoi = version.doi;

  const potentialOrgs = await repos.orgs.listPotentialOrgsForPublication(
    publication.id,
    publication.ownerId
  );
  const mintingEnabled = potentialOrgs.some((o) => o.doiMintingEnabled);

  if (mintingEnabled) {
    try {
      await withPublicationDoiLock(publication.id, async () => {
        // Re-read DOI state now that we hold the per-publication lock: the
        // values fetched above may be stale if another request minted DOIs
        // for this publication while we were waiting for the lock.
        const [freshPublication, freshVersion] = await Promise.all([
          repos.publications.findById(id),
          repos.versions.findById(version.id),
        ]);
        canonicalDoi = freshPublication?.doi ?? null;
        versionDoi = freshVersion?.doi ?? null;

        if (canonicalDoi && versionDoi) {
          await publishDraftDois(repos, publication.id, version.id, {
            slug: publication.slug,
            // It's passed readiness so we know it has a title
            title: version.title!,
            subtitle: version.subtitle ?? "",
            abstract: version.abstract ?? "",
            license: publication.license,
            versionNumber: version.versionNumber,
            versionDesc: versionDesc ?? "",
            publishDate,
            canonicalDoi,
            versionDoi,
          });
        } else if (!canonicalDoi && version.title) {
          const [cDoi, vDoi] = await mintDoisForNewPub(
            repos,
            publication.id,
            version.id,
            {
              slug: publication.slug,
              title: version.title,
              subtitle: version.subtitle ?? "",
              abstract: version.abstract ?? "",
              license: publication.license,
              versionDesc: versionDesc ?? "",
              publishDate,
            }
          );
          if (cDoi) {
            await repos.publications.update(publication.id, { doi: cDoi });
            canonicalDoi = cDoi;
          }
          if (vDoi) {
            await repos.versions.update(version.id, { doi: vDoi });
            versionDoi = vDoi;
          }
        } else if (canonicalDoi && version.title) {
          const vDoi = await mintDoiForNewVersion(
            repos,
            publication.id,
            version.id,
            {
              slug: publication.slug,
              title: version.title,
              subtitle: version.subtitle ?? "",
              abstract: version.abstract ?? "",
              license: publication.license,
              versionNumber: version.versionNumber,
              versionDesc: versionDesc ?? "",
              publishDate,
              canonicalDoi,
              updateCanonical: publication.state !== "PUBLISHED",
            }
          );
          if (vDoi) {
            await repos.versions.update(version.id, { doi: vDoi });
            versionDoi = vDoi;
          }
        }
      });
    } catch (e) {
      if (e instanceof DoiLockTimeoutError) {
        requestLogger.error(
          { err: e },
          "DOI mint lock timed out; skipping DOI minting for this publish"
        );
      } else {
        requestLogger.error({ err: e }, "DOI minting error");
      }
    }
  }

  // Deleting a publication hid its DOIs; publishing a new version makes it
  // available again, so make them findable. The new version's own DOI was
  // just minted as findable.
  if (publication.state === "DELETED") {
    const hiddenDois = [
      ...(canonicalDoi ? [canonicalDoi] : []),
      ...(
        await repos.versions.listDois(publication.id, { state: "PUBLISHED" })
      ).filter((doi) => doi !== versionDoi),
    ];
    if (hiddenDois.length > 0 && !(await setDoisFindable(hiddenDois, true))) {
      requestLogger.error(
        { publicationId: publication.id, dois: hiddenDois },
        "Failed to make DOIs findable for a republished publication"
      );
    }
  }

  extractAndStoreVersionReferences(version.idInt, {
    format: version.importDocumentFormat,
    abstract: version.abstract,
    body: uploadedBody,
    bibliography: version.bibliography,
    frontmatter: version.frontmatter,
  }).catch((e) =>
    requestLogger.error({ err: e }, "Failed to extract and store references")
  );
  // MyST versions get no PDF (see the initial-myst-support skill).
  if (!isMystContent(version.importDocumentFormat)) {
    triggerPdfGeneration(publication.slug, version.versionNumber);
  }

  notifyForNewPublication({
    publicationId: publication.id,
    versionId: version.id,
  }).catch((e) =>
    logger.error({ err: e }, "Failed to send new publication notifications")
  );

  return {
    status: "published",
    published: {
      publicationId: publication.id,
      slug: publication.slug,
      versionNumber: version.versionNumber,
      state: "PUBLISHED",
      doi: canonicalDoi,
      versionDoi,
    },
  };
}
