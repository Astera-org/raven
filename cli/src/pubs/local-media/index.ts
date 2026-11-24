import {
  DEFINITION_LABEL,
  findDefinitions,
  referencePattern,
} from "./definitions.js";
import { htmlFragment, htmlMediaTargets } from "./html.js";
import { replaceOutsideCode, withoutInlineCode } from "./mask.js";
import { CODE_NODES, isMathInParagraph, parseMyst, visit } from "./parse.js";
import { DESTINATION_CONTEXT, spellings, targetPattern } from "./patterns.js";

export { mediaPath } from "./patterns.js";

export interface LocalReference {
  /** 1-based line number in the document. */
  line: number;
  target: string;
}

export interface LocalMedia {
  /** The path as the document's AST has it, e.g. `figures/plot%20a.png`. */
  target: string;
  /** Where it's referenced. */
  references: LocalReference[];
  /** The 1-based lines that hold the path, where it gets rewritten. */
  lines: number[];
}

export interface LocalFiles {
  /** Images to upload, one entry per distinct target. */
  media: LocalMedia[];
  /** Files raven can't upload, such as `{include}` arguments. */
  unsupported: LocalReference[];
}

/** Directives whose argument is a file that isn't uploaded. */
const INCLUDE_DIRECTIVES = new Set(["include", "literalinclude"]);

/**
 * Finds local files a MyST document references, from its AST: Markdown
 * images (inline and reference-style), HTML `<img>`, `<video>` and
 * `<audio>`, the `{image}` and `{figure}` directives, and the `{include}` and
 * `{literalinclude}` directives. Code is never looked into.
 *
 * `mystParse` only records lines, so each image keeps the lines its path can
 * be on: the node's own, and for a reference-style image, its definition's.
 * A reference's line is where its path is written, or for a reference-style
 * image, where its label is.
 */
export function findLocalFiles(source: string): LocalFiles {
  const tree = parseMyst(source);
  const maskedLines = withoutInlineCode(source, tree);
  const images: { target: string; lines: [number, number] }[] = [];
  const unsupported: LocalReference[] = [];
  const codeLines = new Set<number>();

  visit(tree, undefined, (node, lines, parent) => {
    if (!lines) return;
    if (CODE_NODES.has(node.type) && !isMathInParagraph(node, parent)) {
      for (const line of range(lines)) codeLines.add(line);
    } else if (node.type === "image" && node.url && isLocal(node.url)) {
      images.push({ target: node.url, lines });
    } else if (node.type === "html") {
      for (const target of htmlMediaTargets(htmlFragment(node, parent))) {
        if (isLocal(target)) images.push({ target, lines });
      }
    } else if (
      node.type === "mystDirective" &&
      INCLUDE_DIRECTIVES.has(node.name ?? "") &&
      node.args &&
      isLocal(node.args)
    ) {
      unsupported.push({ line: lines[0], target: node.args });
    }
  });

  const definitions = findDefinitions(source, codeLines);
  const media = new Map<string, LocalMedia>();
  const seen = new Map<string, number>();
  for (const { target, lines } of images) {
    const entry = media.get(target) ?? { target, references: [], lines: [] };
    const candidates = range(lines);
    const labels = spellings(target).flatMap(
      (spelling) => definitions.get(spelling)?.labels ?? []
    );
    const block = `${lines[0]}:${target}`;
    const index = seen.get(block) ?? 0;
    seen.set(block, index + 1);
    const line =
      findOccurrences(candidates, maskedLines, [
        targetPattern(target),
        ...(labels.length > 0 ? [referencePattern(labels)] : []),
      ])[index] ?? lines[0];
    entry.references.push({ line, target });
    entry.lines.push(...candidates);
    media.set(target, entry);
  }
  for (const entry of media.values()) {
    for (const spelling of spellings(entry.target)) {
      entry.lines.push(...(definitions.get(spelling)?.lines ?? []));
    }
    entry.lines = [...new Set(entry.lines)]
      .filter((line) => !codeLines.has(line))
      .sort((a, b) => a - b);
  }
  return { media: [...media.values()], unsupported };
}

/**
 * Replaces each media target with its URL where it's written as a path, only
 * on the lines that reference it and never inside code.
 */
export function rewriteMedia(
  source: string,
  media: LocalMedia[],
  urls: ReadonlyMap<string, string>
): string {
  const lines = source.split("\n");
  const maskedLines = withoutInlineCode(source, parseMyst(source));
  for (const entry of media) {
    const url = urls.get(entry.target);
    if (url === undefined) continue;
    const pattern = targetPattern(entry.target);
    const destinationPattern = targetPattern(entry.target, DESTINATION_CONTEXT);
    for (const line of entry.lines) {
      const text = lines[line - 1];
      const masked = maskedLines[line - 1];
      if (text === undefined || masked === undefined) continue;
      const isDestination = DEFINITION_LABEL.test(lines[line - 2] ?? "");
      [lines[line - 1], maskedLines[line - 1]] = replaceOutsideCode(
        { text, masked },
        isDestination ? destinationPattern : pattern,
        url
      );
    }
  }
  return lines.join("\n");
}

/**
 * References `rewriteMedia` would leave as local paths because they're
 * written in a way it doesn't recognize, such as a destination on the line
 * after `](`. Found by rewriting with placeholder URLs and looking again.
 */
export function findUnrewritable(
  source: string,
  media: LocalMedia[]
): LocalReference[] {
  const placeholders = new Map(
    media.map((entry, index) => [
      entry.target,
      `https://raven.invalid/${index}`,
    ])
  );
  return findLocalFiles(
    rewriteMedia(source, media, placeholders)
  ).media.flatMap((entry) => entry.references);
}

/**
 * The line of each place one of the patterns matches, outside code, in the
 * order they're written. Images come out of the AST in that order too, so the
 * nth image of a file in a block is at the nth place.
 */
function findOccurrences(
  lines: number[],
  maskedLines: string[],
  patterns: RegExp[]
): number[] {
  return lines.flatMap((line) =>
    patterns
      .flatMap((pattern) => [
        ...(maskedLines[line - 1] ?? "").matchAll(pattern),
      ])
      .map(() => line)
  );
}

function range([start, end]: [number, number]): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** Anything without a URL scheme (`https:`, `data:`) or `//`, and not `#…`. */
function isLocal(target: string): boolean {
  return !/^([a-z][a-z\d+.-]*:|\/\/|#)/i.test(target);
}
