import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";

/** The warning a MyST write gives when its frontmatter DOI is already in use. */
export function doiTakenIssue(): ValidationIssue {
  return {
    code: "custom",
    path: ["doi"],
    message:
      "The DOI wasn't recorded: another publication already has it. " +
      "A DOI in a project's myst.yml applies to every page; set the page's " +
      "own DOI in its frontmatter instead",
  };
}
