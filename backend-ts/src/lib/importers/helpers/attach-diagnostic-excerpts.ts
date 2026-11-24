import {
  buildDiagnosticExcerpt,
  type ImportDiagnostic,
  type ImportedVersionFields,
} from "@raven/core-import-format";

/**
 * Adds the text around each diagnostic's range, so the editor can still show
 * it after the field has been edited. `fields` is the text the ranges point
 * into: the importer's output, by publication field name.
 */
export function attachDiagnosticExcerpts(
  diagnostics: ImportDiagnostic[],
  fields: Partial<ImportedVersionFields>
): ImportDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    const [field, ...rest] = diagnostic.path;
    const text =
      typeof field === "string" && rest.length === 0
        ? fields[field as keyof ImportedVersionFields]
        : null;
    if (!diagnostic.range || typeof text !== "string" || !text) {
      return diagnostic;
    }
    const excerpt = buildDiagnosticExcerpt(text, diagnostic.range);
    return excerpt ? { ...diagnostic, excerpt } : diagnostic;
  });
}
