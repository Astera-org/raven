import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { truncateSubtitle } from "#v1/routes/publications/helpers/truncate-subtitle.js";
import {
  type ImportedPublication,
  ImportedPublicationSchema,
  ImporterError,
} from "@raven/core-import-format";
import { importMystmd } from "@raven/importer-mystmd";

export type MystmdImportResult =
  | {
      status: "imported";
      imported: ImportedPublication;
      /** What was changed to store the document, e.g. a truncated subtitle. */
      warnings: ValidationIssue[];
    }
  | { status: "invalid"; issues: ValidationIssue[] };

/**
 * Imports a MyST document a client sent. Unlike a fetched import, it's
 * rejected with the problems to fix rather than failing.
 */
export function runMystmdImport(
  source: string,
  filename: string | null = null
): MystmdImportResult {
  let raw;
  try {
    raw = importMystmd(source, { filename });
  } catch (e) {
    if (!(e instanceof ImporterError) || e.details.code !== "validation") {
      throw e;
    }
    return { status: "invalid", issues: e.details.issues };
  }

  const truncated = truncateSubtitle(raw.version.subtitle);
  const parsed = ImportedPublicationSchema.safeParse({
    ...raw,
    version: { ...raw.version, subtitle: truncated.subtitle },
  });
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.error.issues };
  }
  return {
    status: "imported",
    imported: parsed.data,
    warnings: truncated.warning ? [truncated.warning] : [],
  };
}
