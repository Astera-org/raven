import {
  buildDiagnosticExcerpt,
  type DiagnosticExcerpt,
  DiagnosticExcerptSchema,
  EXCERPT_CONTEXT_CHARS,
  EXCERPT_HIGHLIGHT_CHARS,
  ImportDiagnosticSchema,
  type SourceRange,
} from "@raven/core-import-format";
import { describe, expect, it } from "vitest";

const LINES = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");

/** A range on one line, from `column` for `length` characters. */
function onLine(line: number, column: number, length: number): SourceRange {
  return {
    startLine: line,
    startColumn: column,
    endLine: line,
    endColumn: column + length,
  };
}

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function expectWholeCharacters(excerpt: DiagnosticExcerpt | undefined) {
  const { before, highlight, after } = excerpt!;
  for (const part of [before, highlight.start, highlight.end, after]) {
    expect(part).not.toMatch(LONE_SURROGATE);
  }
}

describe("buildDiagnosticExcerpt", () => {
  it("keeps three lines of context on each side", () => {
    expect(buildDiagnosticExcerpt(LINES, onLine(5, 1, 4))).toEqual({
      startLine: 2,
      before: "line 2\nline 3\nline 4\n",
      highlight: { start: "line", omittedChars: 0, omittedLines: 0, end: "" },
      after: " 5\nline 6\nline 7\nline 8",
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("stops at the start and end of the text", () => {
    expect(buildDiagnosticExcerpt(LINES, onLine(1, 6, 1))).toMatchObject({
      startLine: 1,
      before: "line ",
      after: "\nline 2\nline 3\nline 4",
    });
    expect(buildDiagnosticExcerpt(LINES, onLine(10, 1, 4))).toMatchObject({
      startLine: 7,
      after: " 10",
      clippedEnd: false,
    });
  });

  it("keeps a limited number of characters on a very long line", () => {
    const line = `${"a".repeat(1000)}PROBLEM${"b".repeat(1000)}`;
    const excerpt = buildDiagnosticExcerpt(
      `intro\n${line}\noutro`,
      onLine(2, 1001, 7)
    );

    expect(excerpt).toEqual({
      startLine: 2,
      before: "a".repeat(EXCERPT_CONTEXT_CHARS),
      highlight: {
        start: "PROBLEM",
        omittedChars: 0,
        omittedLines: 0,
        end: "",
      },
      after: "b".repeat(EXCERPT_CONTEXT_CHARS),
      clippedStart: true,
      clippedEnd: true,
    });
  });

  it("cuts the middle out of a long problem, like a data: URL", () => {
    const url = `data:image/png;base64,${"A".repeat(5000)}`;
    const excerpt = buildDiagnosticExcerpt(
      `:::image{src="${url}"}\n:::`,
      onLine(1, 15, url.length)
    );

    const { start, omittedChars, end } = excerpt!.highlight;
    expect(start).toBe(url.slice(0, EXCERPT_HIGHLIGHT_CHARS / 2));
    expect(end).toBe(url.slice(-EXCERPT_HIGHLIGHT_CHARS / 2));
    expect(omittedChars).toBe(url.length - EXCERPT_HIGHLIGHT_CHARS);
    expect(excerpt).toMatchObject({
      before: ':::image{src="',
      after: '"}\n:::',
    });
  });

  it("counts the lines cut from a long multi-line problem", () => {
    const block = Array.from({ length: 20 }, (_, i) => `row ${i}`).join("\n");
    const text = `before\n${block}\nafter`;
    const excerpt = buildDiagnosticExcerpt(text, {
      startLine: 2,
      startColumn: 1,
      endLine: 21,
      endColumn: 7,
    });

    const { start, omittedChars, omittedLines, end } = excerpt!.highlight;
    expect(block.startsWith(start)).toBe(true);
    expect(block.endsWith(end)).toBe(true);
    expect(start.length + omittedChars + end.length).toBe(block.length);
    const omitted = block.slice(start.length, block.length - end.length);
    expect(omittedLines).toBe(omitted.split("\n").length - 1);
    expect(
      start.split("\n").length + omittedLines + end.split("\n").length - 1
    ).toBe(20);
  });

  it("never cuts a character in half", () => {
    // 300 emoji, each a surrogate pair, so cut points can fall inside one.
    const emoji = "😀".repeat(300);

    const context = buildDiagnosticExcerpt(
      `${emoji}XYZ${emoji}`,
      onLine(1, 602, 1)
    );
    expectWholeCharacters(context);
    expect(context!.before).toHaveLength(EXCERPT_CONTEXT_CHARS - 1);
    expect(context!.after).toHaveLength(EXCERPT_CONTEXT_CHARS - 1);

    const problem = `x${emoji}x`;
    const halves = buildDiagnosticExcerpt(
      `(${problem})`,
      onLine(1, 2, problem.length)
    );
    expectWholeCharacters(halves);
    expect(halves!.highlight.start).toHaveLength(
      EXCERPT_HIGHLIGHT_CHARS / 2 - 1
    );
    expect(halves!.highlight.end).toHaveLength(EXCERPT_HIGHLIGHT_CHARS / 2 - 1);
  });

  it("has no excerpt for a range that isn't in the text", () => {
    expect(buildDiagnosticExcerpt(LINES, onLine(11, 1, 1))).toBeUndefined();
    expect(buildDiagnosticExcerpt(LINES, onLine(1, 3, 20))).toBeUndefined();
  });

  it("is valid on a diagnostic", () => {
    const excerpt = buildDiagnosticExcerpt(LINES, onLine(5, 1, 4));

    expect(DiagnosticExcerptSchema.parse(excerpt)).toEqual(excerpt);
    expect(
      ImportDiagnosticSchema.parse({
        code: "test",
        severity: "warning",
        message: "Test",
        path: ["body"],
        range: onLine(5, 1, 4),
        excerpt,
      }).excerpt
    ).toEqual(excerpt);
  });
});
