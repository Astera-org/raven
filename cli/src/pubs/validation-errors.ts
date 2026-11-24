export interface ValidationIssue {
  path: Array<string | number | null>;
  message: string;
  /** `warning`s don't stop publishing; issues without one do. */
  severity?: "error" | "warning";
}

/**
 * Whether the server's `validationErrors` are ready to publish: issues with
 * severity `warning` don't count, the rest, such as a missing title, do.
 */
export function formatValidationErrors(
  issues: readonly ValidationIssue[]
): string {
  const blocking = issues.filter((issue) => issue.severity !== "warning");
  if (blocking.length === 0) return "Ready to publish.";
  return ["Not ready to publish yet:", ...formatIssues(blocking)].join("\n");
}

/** What the server changed or couldn't use, which doesn't stop publishing. */
export function warningIssues(
  issues: readonly ValidationIssue[]
): ValidationIssue[] {
  return issues.filter((issue) => issue.severity === "warning");
}

/** One indented line per issue. */
export function formatIssues(issues: readonly ValidationIssue[]): string[] {
  return issues.map((issue) => `  ${formatIssue(issue)}`);
}

/** The issue's path, if any, and its message, e.g. `subtitle: …`. */
export function formatIssue(issue: ValidationIssue): string {
  const path = issue.path.filter((part) => part !== null).join(".");
  return `${path ? `${path}: ` : ""}${issue.message}`;
}
