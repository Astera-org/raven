import { type Version } from "#src/db/schema.js";
import { type CSL } from "#src/lib/bibliography/parse-bibliography.js";
import { isMystContent } from "#src/lib/importers/document-formats.js";
import { logger } from "#src/lib/logger.js";
import {
  getMdastCache,
  MdastUnavailableError,
} from "#src/lib/myst/mdast-cache.js";
import { type PublicationBibliographyResponseSchema } from "#v1/routes/publications/route-responses/bibliography.js";
import { type z } from "@hono/zod-openapi";

type PublicationBibliographyResponse = z.infer<
  typeof PublicationBibliographyResponseSchema
>;

/**
 * The bibliography of a publication, version or draft response: its files'
 * names, and the entries the document cites. Only the cited ones: a project's
 * `.bib` files are sent whole, and the rest of a researcher's library has no
 * business being published with the document.
 *
 * Absent for a version with no bibliography, and when the AST that says which
 * entries are cited can't be built.
 */
export function publicationBibliography(
  version: Pick<
    Version,
    | "abstract"
    | "body"
    | "bibliography"
    | "frontmatter"
    | "importDocumentFormat"
  >
): PublicationBibliographyResponse | undefined {
  const bibliography = version.bibliography;
  if (
    !bibliography?.files.length ||
    !isMystContent(version.importDocumentFormat)
  ) {
    return undefined;
  }

  // The cited entries come from the same cache entry as the AST that says
  // which keys are cited, so a hit costs no BibTeX parsing at all.
  let citedEntries: Record<string, CSL>;
  try {
    citedEntries = getMdastCache().get({
      abstract: version.abstract,
      body: version.body,
      bibliography,
      frontmatter: version.frontmatter,
    }).citedEntries;
  } catch (e) {
    if (!(e instanceof MdastUnavailableError)) throw e;
    logger.warn(
      { reason: e.reason },
      "Leaving the bibliography out of the response: the MyST AST is unavailable"
    );
    return undefined;
  }

  return {
    files: bibliography.files.map(({ filename }) => filename),
    // Copied, so a response cannot reach into the cached entry.
    entries: { ...citedEntries },
  };
}
