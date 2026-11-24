import { escapeRegExp, unescapeMarkdown } from "./patterns.js";

const DEFINITION = /^[ >]*\[([^\]]+)\]:\s*(?:<([^>]*)>|(\S+))/;

/** A reference definition's label, with its destination on the next line. */
export const DEFINITION_LABEL = /^[ >]*\[([^\]]+)\]:\s*$/;

const DESTINATION = /^[\s>]*(?:<([^>]*)>|(\S+))/;

interface Definitions {
  /** The lines that hold the destination. */
  lines: number[];
  labels: string[];
}

/**
 * Link reference definitions outside code, by the target they define,
 * unescaped as the AST has it. `mystParse` drops definitions from the AST,
 * so they're found in the source.
 */
export function findDefinitions(
  source: string,
  codeLines: ReadonlySet<number>
): Map<string, Definitions> {
  const sourceLines = source.split("\n");
  const found = new Map<string, Definitions>();
  const add = (
    label: string | undefined,
    written: string | undefined,
    line: number
  ) => {
    if (!label || !written) return;
    const target = unescapeMarkdown(written);
    const entry = found.get(target) ?? { lines: [], labels: [] };
    entry.lines.push(line);
    entry.labels.push(label);
    found.set(target, entry);
  };
  sourceLines.forEach((text, index) => {
    const line = index + 1;
    if (codeLines.has(line)) return;
    const label = DEFINITION_LABEL.exec(text)?.[1];
    if (label === undefined) {
      const definition = DEFINITION.exec(text);
      add(definition?.[1], definition?.[2] ?? definition?.[3], line);
    } else if (!codeLines.has(line + 1)) {
      const destination = DESTINATION.exec(sourceLines[line] ?? "");
      add(label, destination?.[1] ?? destination?.[2], line + 1);
    }
  });
  return found;
}

/**
 * Where an image names one of the labels: `![alt][label]`, `![label][]` or
 * `![label]`, but not an inline image `![label](…)`. Labels match without
 * regard to case or runs of whitespace.
 */
export function referencePattern(labels: string[]): RegExp {
  const alternatives = labels
    .map((label) =>
      label
        .trim()
        .split(/\s+/)
        .map(escapeRegExp)
        .join(String.raw`\s+`)
    )
    .join("|");
  return new RegExp(
    String.raw`!\[(?:[^\]]*\]\[\s*)?(?:${alternatives})\s*\](?:\[\])?(?![[(])`,
    "gi"
  );
}
