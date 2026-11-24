import { attachDiagnosticExcerpts } from "#src/lib/importers/helpers/attach-diagnostic-excerpts.js";
import {
  buildDiagnosticExcerpt,
  type ImportDiagnostic,
} from "@raven/core-import-format";
import { describe, expect, it } from "vitest";

const body = "Before\n\n\\:::\n\nAfter";
const strayClose = { startLine: 3, startColumn: 1, endLine: 3, endColumn: 5 };

function diagnostic(
  path: ImportDiagnostic["path"],
  range?: ImportDiagnostic["range"]
): ImportDiagnostic {
  return { code: "test", severity: "warning", message: "Test", path, range };
}

describe("attachDiagnosticExcerpts", () => {
  it("adds the text around the range in the field the path names", () => {
    const [inBody, inTitle] = attachDiagnosticExcerpts(
      [
        diagnostic(["body"], strayClose),
        diagnostic(["title"], {
          startLine: 1,
          startColumn: 7,
          endLine: 1,
          endColumn: 11,
        }),
      ],
      { title: "A big _title", body }
    );

    expect(inBody!.excerpt).toEqual(buildDiagnosticExcerpt(body, strayClose));
    expect(inBody!.excerpt).toMatchObject({
      before: "Before\n\n",
      highlight: { start: "\\:::" },
      after: "\n\nAfter",
    });
    expect(inTitle!.excerpt).toMatchObject({
      before: "A big ",
      highlight: { start: "_tit" },
      after: "le",
    });
  });

  it("leaves a diagnostic alone when there's no text to point into", () => {
    const fields = { title: "Title", subtitle: null, body };
    const unchanged = [
      diagnostic(["body"]),
      diagnostic([], strayClose),
      diagnostic(["subtitle"], strayClose),
      diagnostic(["abstract"], strayClose),
      diagnostic(["importDocument", "filename"], strayClose),
      diagnostic(["body", 0], strayClose),
      diagnostic(["body"], { ...strayClose, startLine: 30, endLine: 30 }),
    ];

    expect(attachDiagnosticExcerpts(unchanged, fields)).toEqual(unchanged);
  });
});
