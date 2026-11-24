import { type Publication, type Version } from "#src/db/schema.js";
import { createVersionImport } from "#src/lib/importers/create-version-import.js";
import { attachDiagnosticExcerpts } from "#src/lib/importers/helpers/attach-diagnostic-excerpts.js";
import { finishImport } from "#src/lib/importers/helpers/finish-import.js";
import { createMediaImportEntries } from "#src/lib/media/create-media-import-entries.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { type ImportedPublication } from "@raven/core-import-format";
import { ulid } from "ulid";
import { convertDiagnosticIssues } from "./helpers/convert-diagnostic-issues.js";

/**
 * Re-imports into an existing draft, as re-syncing its doc does: replaces the
 * draft's title, subtitle, abstract and body with the importer's and makes
 * this the draft's current import, with its diagnostics and a new media
 * batch. Contributors, orgs, tags, license and linked assets are left as the
 * draft has them, so the rest of the importer's result is ignored.
 *
 * Changes nothing, and says why, if the draft has been published or deleted
 * since the caller looked it up (converting the doc takes a while), or while
 * an earlier import's media is still being copied into it, since the worker
 * would write its URLs into the replaced body.
 */
export async function replaceDraftFromImport({
  imported,
  publicationId,
  versionId,
}: {
  imported: ImportedPublication;
  publicationId: Publication["id"];
  versionId: Version["id"];
}): Promise<
  | {
      status: "replaced";
      importId: string;
      /** False while queued media uploads can still change the draft body. */
      settled: boolean;
      issues: ValidationIssue[];
    }
  | { status: "not-a-draft" }
  | { status: "media-importing" }
> {
  const { version, importDocument, diagnostics } = imported;
  const importId = ulid();

  const entries = await new Repositories().transaction(async (repos) => {
    // Media workers and other re-imports lock the draft too, so nothing can
    // start a batch between these checks and the new import's. Publishing
    // updates the same row, so it can't change its state underneath either.
    const locked = await repos.versions.findForUpdate(versionId);
    if (locked?.state !== "DRAFT") return "not-a-draft" as const;
    if (await repos.imports.hasUnsettledMediaImport(publicationId)) {
      return "media-importing" as const;
    }

    await repos.versions.update(versionId, {
      title: version.title?.slice(0, 255) ?? null,
      subtitle: version.subtitle?.slice(0, 300) ?? null,
      abstract: version.abstract,
      body: version.body,
      frontmatter: version.frontmatter,
      importDocumentBody: importDocument.body,
      importDocumentUrl: importDocument.url,
      importDocumentFilename: importDocument.filename,
      importDocumentFormat: importDocument.format,
      importDocumentSyncDate: new Date(),
    });
    await createVersionImport(repos, {
      id: importId,
      versionId,
      format: importDocument.format,
      url: importDocument.url,
      filename: importDocument.filename,
      body: importDocument.body,
      diagnostics: attachDiagnosticExcerpts(diagnostics, version),
    });

    return createMediaImportEntries({
      media: imported.media,
      publicationId,
      versionId,
      importId,
      repos,
    });
  });
  if (typeof entries === "string") return { status: entries };

  const { settled } = await finishImport({
    ...entries,
    publicationId,
    versionId,
  });
  return {
    status: "replaced",
    importId,
    settled,
    issues: convertDiagnosticIssues(diagnostics),
  };
}
