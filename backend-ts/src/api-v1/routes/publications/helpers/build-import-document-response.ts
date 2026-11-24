import {
  type ImportedVersionField,
  type VersionImport,
} from "#src/db/schema.js";
import { dbDateToIso8601 } from "#src/lib/dates.js";
import {
  type ImportDocumentResponse,
  type VersionImportDocumentResponse,
} from "#v1/routes/publications/route-responses/publication.js";

/** A listed version's current import. */
export function buildVersionImportDocumentResponse(
  versionImport: Omit<VersionImport, "body" | "diagnostics"> | null | undefined
): VersionImportDocumentResponse | null {
  if (!versionImport) return null;
  return {
    id: versionImport.id,
    url: versionImport.url,
    format: versionImport.format,
    filename: versionImport.filename,
    syncDate: dbDateToIso8601(versionImport.syncedAt),
  };
}

/**
 * The `importDocument` of a publication response, from the version's current
 * import. Diagnostics and edited fields are for the editor, so only the draft
 * includes them.
 */
export function buildImportDocumentResponse(
  versionImport: Omit<VersionImport, "body"> | null,
  {
    forDraft,
    editedFields,
  }: { forDraft: boolean; editedFields: ImportedVersionField[] }
): ImportDocumentResponse | undefined {
  if (!versionImport) return undefined;
  const response = buildVersionImportDocumentResponse(versionImport);
  if (!response) return undefined;
  return {
    ...response,
    diagnostics: forDraft ? versionImport.diagnostics : null,
    editedFields: forDraft ? editedFields : null,
  };
}
