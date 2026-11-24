/**
 * The file path a target names, with `%20` and the like decoded, `%23` and
 * `%3F` included, since a local path has no query or fragment for them to
 * stand apart from.
 */
export function mediaPath(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/** How a target may be written in the source: as parsed, or decoded. */
export function spellings(target: string): string[] {
  return [...new Set([target, mediaPath(target)])];
}

export const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;

const ESCAPED_PUNCTUATION = new RegExp(
  String.raw`\\(${ASCII_PUNCTUATION.source})`,
  "g"
);

export function unescapeMarkdown(text: string): string {
  return text.replace(ESCAPED_PUNCTUATION, "$1");
}

/** Matches a spelling with or without Markdown's backslash escapes. */
function spellingPattern(spelling: string): string {
  return [...spelling]
    .map(
      (char) =>
        (ASCII_PUNCTUATION.test(char) ? String.raw`\\?` : "") +
        escapeRegExp(char)
    )
    .join("");
}

/**
 * Where a path is written: after `](` (an inline image, or a link to the same
 * file), in a reference definition, as the argument of `{image}` or
 * `{figure}`, or as an HTML `src` or `poster`. The same path in prose or a
 * caption isn't.
 */
const PATH_CONTEXT = [
  String.raw`\]\(\s*<?`,
  String.raw`^[ >]*\[[^\]]+\]:\s*<?`,
  String.raw`(?:\`{3,}|~{3,}|:{3,})\s*\{(?:image|figure)\}\s+`,
  String.raw`\b(?:[sS][rR][cC]|[pP][oO][sS][tT][eE][rR])\s*=\s*["']?`,
].join("|");

/** Where a reference definition's destination is written on its own line. */
export const DESTINATION_CONTEXT = String.raw`^[\s>]*<?`;

/**
 * Matches a target where it's written as a path, ending where the path ends,
 * so `a.png` doesn't match `a.png.bak`.
 */
export function targetPattern(target: string, context = PATH_CONTEXT): RegExp {
  const alternatives = spellings(target)
    .sort((a, b) => b.length - a.length)
    .map(spellingPattern)
    .join("|");
  return new RegExp(`(?<=${context})(?:${alternatives})(?=$|[\\s)>"'])`, "g");
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
