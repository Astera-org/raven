import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";

/**
 * Issues for the `validationErrors` of a create or push, marked with their
 * `severity`: `error` for what stops the draft from being published,
 * `warning` for what the server changed or couldn't use, such as a truncated
 * subtitle or an unresolved citation. A response may combine several of
 * these lists, so clients go by `severity`, not position.
 */
export function draftIssues(
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): ValidationIssue[] {
  return [
    ...errors.map((issue) => ({ ...issue, severity: "error" as const })),
    ...warnings.map((issue) => ({ ...issue, severity: "warning" as const })),
  ];
}
