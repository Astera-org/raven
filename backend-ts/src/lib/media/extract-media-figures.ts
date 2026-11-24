const FIGURE_DIRECTIVE_PATTERN =
  /^:::+figure\{[^}]*type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))[^}]*\}/gm;

/**
 * Looks for media URLs in container directive attributes (e.g., :::image{src=...}).
 * Supports quoted and unquoted regular URLs.
 */
export function extractFigures(body: string): { figureType: string }[] {
  const urls: { figureType: string }[] = [];
  for (const match of body.matchAll(FIGURE_DIRECTIVE_PATTERN)) {
    const figureType = match[1] || match[2] || match[3];
    if (figureType) {
      urls.push({ figureType });
    }
  }
  return Array.from(new Set(urls));
}
