import { z } from "zod";
import { type SourceRange } from "./import-diagnostic.js";

/** Lines of context an excerpt keeps on each side of the problem. */
export const EXCERPT_CONTEXT_LINES = 3;
/** Characters of context an excerpt keeps on each side, at most. */
export const EXCERPT_CONTEXT_CHARS = 200;
/** Problems longer than this keep only their first and last halves. */
export const EXCERPT_HIGHLIGHT_CHARS = 200;

/**
 * The text around a diagnostic's range when it was found, so it can still be
 * shown, and found again, after the field has been edited. Every string is
 * taken verbatim from the field: nothing is inserted where text was cut.
 */
export const DiagnosticExcerptSchema = z.object({
  /** The line of the field that `before` starts on. */
  startLine: z.number().int().min(1),
  /**
   * The text before the problem: back to the start of the line
   * `EXCERPT_CONTEXT_LINES` lines up, or `EXCERPT_CONTEXT_CHARS` characters,
   * whichever is shorter.
   */
  before: z.string(),
  /**
   * The problem's text. Over `EXCERPT_HIGHLIGHT_CHARS` characters, `start` and
   * `end` are its first and last halves with the rest omitted; otherwise
   * `start` is all of it and `end` is empty.
   */
  highlight: z.object({
    start: z.string(),
    omittedChars: z.number().int().min(0),
    /** Line breaks in the omitted text, to keep line numbers right. */
    omittedLines: z.number().int().min(0),
    end: z.string(),
  }),
  /** The text after the problem, limited like `before`. */
  after: z.string(),
  /** `before` starts partway through a line. */
  clippedStart: z.boolean(),
  /** `after` stops partway through a line. */
  clippedEnd: z.boolean(),
});
export type DiagnosticExcerpt = z.infer<typeof DiagnosticExcerptSchema>;

/**
 * The excerpt of `text` around `range`, or `undefined` if the range isn't in
 * `text`.
 */
export function buildDiagnosticExcerpt(
  text: string,
  range: SourceRange
): DiagnosticExcerpt | undefined {
  const lineStarts = findLineStarts(text);
  const from = toOffset(text, lineStarts, range.startLine, range.startColumn);
  const to = toOffset(text, lineStarts, range.endLine, range.endColumn);
  if (from === undefined || to === undefined || to < from) return undefined;

  const firstLine = Math.max(1, range.startLine - EXCERPT_CONTEXT_LINES);
  const beforeStart = keepWholePairs(
    text,
    Math.max(lineStarts[firstLine - 1]!, from - EXCERPT_CONTEXT_CHARS),
    1
  );
  const lastLine = Math.min(
    lineStarts.length,
    range.endLine + EXCERPT_CONTEXT_LINES
  );
  const afterEnd = keepWholePairs(
    text,
    Math.min(lineEnd(text, lineStarts, lastLine), to + EXCERPT_CONTEXT_CHARS),
    -1
  );

  return {
    startLine: lineOf(lineStarts, beforeStart),
    before: text.slice(beforeStart, from),
    highlight: shorten(text.slice(from, to)),
    after: text.slice(to, afterEnd),
    clippedStart: beforeStart > 0 && text[beforeStart - 1] !== "\n",
    clippedEnd: afterEnd < text.length && text[afterEnd] !== "\n",
  };
}

function shorten(problem: string): DiagnosticExcerpt["highlight"] {
  if (problem.length <= EXCERPT_HIGHLIGHT_CHARS) {
    return { start: problem, omittedChars: 0, omittedLines: 0, end: "" };
  }
  const half = Math.floor(EXCERPT_HIGHLIGHT_CHARS / 2);
  const startEnd = keepWholePairs(problem, half, -1);
  const endStart = keepWholePairs(problem, problem.length - half, 1);
  const omitted = problem.slice(startEnd, endStart);
  return {
    start: problem.slice(0, startEnd),
    omittedChars: omitted.length,
    omittedLines: omitted.split("\n").length - 1,
    end: problem.slice(endStart),
  };
}

/** The offset of the first character of each line. */
function findLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    starts.push(i + 1);
  }
  return starts;
}

function lineEnd(text: string, lineStarts: number[], line: number): number {
  return line < lineStarts.length ? lineStarts[line]! - 1 : text.length;
}

function toOffset(
  text: string,
  lineStarts: number[],
  line: number,
  column: number
): number | undefined {
  if (line > lineStarts.length) return undefined;
  const start = lineStarts[line - 1]!;
  const offset = start + column - 1;
  return offset <= lineEnd(text, lineStarts, line) ? offset : undefined;
}

function lineOf(lineStarts: number[], offset: number): number {
  let line = 1;
  while (line < lineStarts.length && lineStarts[line]! <= offset) line++;
  return line;
}

/**
 * Moves `index` by `shift` if it falls between the two halves of a surrogate
 * pair, so cutting there doesn't leave half a character behind.
 */
function keepWholePairs(text: string, index: number, shift: 1 | -1): number {
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  const splitsPair =
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
  return splitsPair ? index + shift : index;
}
