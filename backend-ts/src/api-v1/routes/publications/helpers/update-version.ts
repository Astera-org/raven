import {
  IMPORTED_VERSION_FIELDS,
  type ImportedVersionField,
  type Version,
  type VersionUpdate,
} from "#src/db/schema.js";
import { createVersionImport } from "#src/lib/importers/create-version-import.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { type ImportDocumentUpdate } from "#v1/routes/publications/route-requests/patch-publication.js";
import { sql } from "drizzle-orm";

type UpdateVersionReturnType = Array<
  ImportedVersionField | "versionDesc" | "importDocument"
>;

type UpdateVersionResult =
  | { status: "not-a-draft" }
  | {
      status: "applied";
      applied: UpdateVersionReturnType;
      /** A media import started after the caller's own check. */
      bodyRejected: boolean;
    };

export async function updateVersion(
  versionId: string,
  body: VersionUpdate,
  importDocument: ImportDocumentUpdate
): Promise<UpdateVersionResult> {
  const added: UpdateVersionReturnType = [];

  // Build version SET clause — only fields whose key is present in the body.
  const versionSetClauses: VersionUpdate = {};
  if (body.title !== undefined) versionSetClauses.title = body.title ?? null;
  if (body.subtitle !== undefined)
    versionSetClauses.subtitle = body.subtitle ?? null;
  if (body.abstract !== undefined)
    versionSetClauses.abstract = body.abstract ?? null;
  if (body.body != null) versionSetClauses.body = body.body;
  if (body.versionDesc !== undefined)
    versionSetClauses.versionDesc = body.versionDesc ?? null;

  const repos = new Repositories();
  return repos.transaction(async (repos) => {
    // Re-imports, media workers and publishing take this lock too, so the
    // checks below still hold when the write commits. The caller's own checks
    // ran before its media upload, which can take a while.
    const locked = await repos.versions.findForUpdate(versionId);
    if (locked?.state !== "DRAFT") return { status: "not-a-draft" } as const;

    // The media import worker rewrites the body as uploads finish.
    const bodyRejected =
      versionSetClauses.body !== undefined &&
      (await repos.imports.hasUnsettledMediaImport(locked.publicationId));
    if (bodyRejected) delete versionSetClauses.body;

    added.push(...(Object.keys(versionSetClauses) as UpdateVersionReturnType));

    // Replacing the import makes these fields its starting point; clearing it
    // leaves nothing to compare against.
    if (importDocument === undefined && locked.currentImportId) {
      const editedFields = editedFieldsAfter(locked, versionSetClauses);
      if (editedFields.length > locked.editedFields.length) {
        versionSetClauses.editedFields = editedFields;
      }
    }

    // Add import document fields to version SET clause.
    if (importDocument === null) {
      added.push("importDocument");
      versionSetClauses.importDocumentBody = null;
      versionSetClauses.importDocumentUrl = null;
      versionSetClauses.importDocumentFilename = null;
      versionSetClauses.importDocumentFormat = null;
      versionSetClauses.importDocumentSyncDate = null;
    } else if (importDocument !== undefined) {
      added.push("importDocument");
      versionSetClauses.importDocumentBody = importDocument?.body ?? null;
      versionSetClauses.importDocumentUrl = importDocument?.url ?? null;
      versionSetClauses.importDocumentFilename =
        importDocument?.filename ?? null;
      versionSetClauses.importDocumentFormat = importDocument?.format ?? null;
      versionSetClauses.importDocumentSyncDate = sql`NOW(3)`;
    }

    if (importDocument === null) {
      versionSetClauses.currentImportId = null;
      versionSetClauses.editedFields = [];
    }

    if (Object.keys(versionSetClauses).length > 0) {
      await repos.versions.update(versionId, versionSetClauses);
    }
    if (importDocument) {
      await createVersionImport(repos, {
        versionId,
        format: importDocument.format,
        url: importDocument.url ?? null,
        filename: importDocument.filename ?? null,
        body: importDocument.body,
      });
    }
    return { status: "applied", applied: added, bodyRejected };
  });
}

/**
 * The locked row's edited fields plus those this update changes, in a fixed
 * order. Treats `""` and `null` as the same empty value.
 */
function editedFieldsAfter(
  locked: Version,
  update: VersionUpdate
): ImportedVersionField[] {
  return IMPORTED_VERSION_FIELDS.filter((field) => {
    if (locked.editedFields.includes(field)) return true;
    const value = update[field];
    return value !== undefined && (value ?? "") !== (locked[field] ?? "");
  });
}
