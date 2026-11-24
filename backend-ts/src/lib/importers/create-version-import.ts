import { type VersionImport } from "#src/db/schema.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type ImportDiagnostic } from "@raven/core-import-format";

/**
 * Records an imported source document for a version and makes it the
 * version's current import. Earlier imports are kept as history.
 */
export async function createVersionImport(
  repos: Repositories,
  {
    id,
    versionId,
    format,
    url,
    filename,
    body,
    diagnostics,
  }: {
    id?: VersionImport["id"];
    versionId: VersionImport["versionId"];
    format: string;
    url: string | null;
    filename: string | null;
    body: string;
    diagnostics?: ImportDiagnostic[];
  }
): Promise<VersionImport["id"]> {
  const importId = await repos.imports.create({
    id,
    versionId,
    format,
    url,
    filename,
    body: Buffer.from(body),
    diagnostics: diagnostics ?? null,
  });
  await repos.versions.update(versionId, {
    currentImportId: importId,
    editedFields: [],
  });
  return importId;
}
