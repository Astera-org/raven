import { extractHeadings } from "#src/lib/ast/extract-headings.js";
import { isMystContent } from "#src/lib/importers/document-formats.js";
import { logger } from "#src/lib/logger.js";
import { extractFigures } from "#src/lib/media/extract-media-figures.js";
import {
  getMdastCache,
  MdastUnavailableError,
  type PublicationContent,
} from "#src/lib/myst/mdast-cache.js";

export interface PublicationStats {
  sections: number;
  audio: number;
  images: number;
  videos: number;
  iframes: number;
  tables: number;
  citations: number;
}

export function generateDocumentStats(
  body: string,
  abstract: string | null,
  referenceRows: {
    url: string | null;
    text: string | null;
  }[],
  format: string | null = null,
  {
    bibliography,
    frontmatter,
  }: Pick<PublicationContent, "bibliography" | "frontmatter"> = {}
): PublicationStats {
  // MyST bodies use MyST figures and directives, which the patterns below
  // (written for Google Docs directives) do not see; count from the AST.
  if (isMystContent(format)) {
    try {
      // The bibliography and frontmatter are passed so this shares the cache
      // entry the AST route builds, though they change no count.
      const { sections, ...media } = getMdastCache().get({
        abstract,
        body,
        bibliography,
        frontmatter,
      }).stats;
      return {
        sections: sections + Number(Boolean(abstract)),
        ...media,
        citations: referenceRows.length,
      };
    } catch (e) {
      if (!(e instanceof MdastUnavailableError)) throw e;
      logger.warn(
        { reason: e.reason },
        "Counting document stats by pattern: the MyST AST is unavailable"
      );
    }
  }

  const figures = extractFigures(body);
  const types = figures.map(({ figureType }) => figureType);

  return {
    sections: extractHeadings(body).length + Number(Boolean(abstract)),
    audio: types.filter((t) => t === "audio").length,
    images: types.filter((t) => t === "image").length,
    videos: types.filter((t) => t === "video").length,
    iframes: types.filter((t) => t === "iframe").length,
    tables: types.filter((t) => t === "table").length,
    citations: referenceRows.length,
  };
}
