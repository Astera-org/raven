import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";

import { type ImportDiagnostic } from "@raven/core-import-format";

/** An importer's diagnostics, as the issues an import responds with. */
export function convertDiagnosticIssues(
  diagnostics: ImportDiagnostic[]
): ValidationIssue[] {
  return diagnostics.map(({ code, severity, message, path, range }) => ({
    code,
    severity,
    message,
    path,
    range,
  }));
}
