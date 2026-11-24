import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import {
  getMdastCache,
  MdastUnavailableError,
  type PublicationContent,
} from "#src/lib/myst/mdast-cache.js";

/**
 * What building the MyST AST found (unresolved citations and
 * cross-references, unknown directives, raw HTML), as push warnings. Building
 * here also warms the cache for the first read.
 */
export function mystBuildWarnings(
  content: PublicationContent
): ValidationIssue[] {
  try {
    return getMdastCache()
      .get(content)
      .messages.map((m) => ({
        code: "custom",
        path: [m.part ?? "body"],
        message: m.line ? `Line ${m.line}: ${m.message}` : m.message,
      }));
  } catch (e) {
    if (!(e instanceof MdastUnavailableError)) throw e;
    return [
      {
        code: "custom",
        path: ["body"],
        message: `${e.message} thestacks.org will show this version with its older renderer.`,
      },
    ];
  }
}
