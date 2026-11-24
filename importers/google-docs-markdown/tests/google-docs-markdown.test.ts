import {
  MAXIMUM_ALLOWED_DIRECTIVE_DEPTH,
  MaximumDirectiveDepthError,
} from "#src/errors/MaximumDirectiveDepthError.js";
import {
  importGoogleDoc,
  isGoogleDocUrl,
  type GoogleDocImportOptions,
} from "#src/index.js";
import { DiagnosticCollector } from "#src/lib/diagnostic-markers.js";
import { extractMedia } from "#src/lib/extract-media.js";
import {
  ImportedPublicationSchema,
  ImporterError,
  type ImportedPublicationInput,
  type ImporterContext,
  type SourceRange,
} from "@raven/core-import-format";
import { mystToHtml } from "@raven/core-myst-renderer";
import { describe, expect, it, vi } from "vitest";

const DOC_URL = "https://docs.google.com/document/d/abc123/edit";
const IMAGE_URL = "https://lh3.googleusercontent.com/image-1";

const EXPORT_HTML = `<html><body>
<p class="title"><span>Field Notes</span></p>
<p><span>Some findings.</span></p>
<p><img src="${IMAGE_URL}"></p>
<p><img src="${IMAGE_URL}"></p>
</body></html>`;

function contextReturning(response: Response): ImporterContext {
  return {
    fetch: vi.fn(async () => response),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    signal: new AbortController().signal,
  };
}

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": 'attachment; filename="Field Notes.html"',
    },
    ...init,
  });
}

const paragraphs = (...lines: string[]) =>
  lines.map((line) => `<p><span>${line}</span></p>`).join("");

const docWithBody = (body: string) => `<html><body>${body}</body></html>`;

const docWithMergedCell = (cellHtml: string, before = "") =>
  `<html><body>${before}<table>
<tr><td colspan="2">${cellHtml}</td></tr>
<tr><td>${paragraphs("a")}</td><td>${paragraphs("b")}</td></tr>
</table></body></html>`;

const importHtml = (html: string, options?: GoogleDocImportOptions) =>
  importGoogleDoc(
    new URL(DOC_URL),
    contextReturning(htmlResponse(html)),
    options
  );

function textAt(text: string, range: SourceRange | undefined): string {
  expect(range).toBeDefined();
  const { startLine, startColumn, endLine, endColumn } = range!;
  const lines = text.split("\n").slice(startLine - 1, endLine);
  lines[lines.length - 1] = lines.at(-1)!.slice(0, endColumn - 1);
  lines[0] = lines[0]!.slice(startColumn - 1);
  return lines.join("\n");
}

// Test docs mostly have no title, which is reported separately.
function onlyDiagnostic(result: ImportedPublicationInput) {
  const diagnostics = (result.diagnostics ?? []).filter(
    ({ code }) => code !== "missing-title"
  );
  expect(diagnostics).toHaveLength(1);
  return diagnostics[0]!;
}

describe("isGoogleDocUrl", () => {
  it("accepts Google Docs document URLs only", () => {
    expect(isGoogleDocUrl(new URL(DOC_URL))).toBe(true);
    expect(
      isGoogleDocUrl(
        new URL("https://docs.google.com/spreadsheets/d/abc123/edit")
      )
    ).toBe(false);
    expect(isGoogleDocUrl(new URL("https://example.com/document/d/abc"))).toBe(
      false
    );
  });
});

describe("importGoogleDoc", () => {
  it("converts the export into the standard import format", async () => {
    const context = contextReturning(htmlResponse(EXPORT_HTML));
    const result = ImportedPublicationSchema.parse(
      await importGoogleDoc(new URL(DOC_URL), context)
    );

    expect(context.fetch).toHaveBeenCalledWith(
      "https://docs.google.com/document/d/abc123/export?format=html",
      expect.objectContaining({ signal: context.signal })
    );
    expect(result.version.title).toBe("Field Notes");
    expect(result.version.body).toContain("Some findings.");
    expect(result.version.body).toMatch(
      /:::::image\{src="raven-media:\/\/[0-9A-HJKMNP-TV-Z]{26}"\}/
    );
    expect(result.version.body).not.toContain(IMAGE_URL);
    expect(result.media).toEqual([
      {
        ref: expect.stringMatching(/^raven-media:\/\/[0-9A-HJKMNP-TV-Z]{26}$/),
        source: { type: "url", url: IMAGE_URL },
        figureType: "image",
      },
    ]);
    expect(result.importDocument).toEqual({
      format: "gdoc",
      body: EXPORT_HTML,
      url: DOC_URL,
      filename: "Field Notes.gdoc",
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("falls back to the filename when the doc has no title", async () => {
    const result = await importGoogleDoc(
      new URL(DOC_URL),
      contextReturning(htmlResponse("<html><body><p>Body</p></body></html>"))
    );
    expect(result.version.title).toBe("Field Notes");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "missing-title",
        path: ["title"],
      }),
    ]);
  });

  it("warns when the file name can't be read", async () => {
    const response = new Response("<html><body><p>Body</p></body></html>", {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": ";;;",
      },
    });
    const result = await importGoogleDoc(
      new URL(DOC_URL),
      contextReturning(response)
    );

    expect(result.version.title).toBe("Untitled");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing-filename",
        path: ["importDocument", "filename"],
      })
    );
  });

  it("strips comment markers and threads", async () => {
    const html = `<html>
<head><style>.c1 { vertical-align: super }</style></head>
<body>
<p>Some text<sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup> continues and E=mc<span class="c1">2</span>.</p>
<p>More text<sup><a href="#cmnt2" id="cmnt_ref2">[b]</a></sup></p>
<div>
<p><a href="#cmnt_ref1" id="cmnt1">[a]</a><span>Reviewer note</span></p>
<p><span>A reply to the note</span></p>
</div>
<div>
<p><a href="#cmnt_ref2" id="cmnt2">[b]</a><span>Second note</span></p>
</div>
</body></html>`;
    const { body } = (
      await importGoogleDoc(
        new URL(DOC_URL),
        contextReturning(htmlResponse(html))
      )
    ).version;

    expect(body).toContain("Some text continues");
    expect(body).toContain("E=mc<sup>2</sup>");
    expect(body).toContain("More text");
    expect(body).not.toMatch(/\[a\]|\[b\]|cmnt/);
    expect(body).not.toContain("Reviewer note");
    expect(body).not.toContain("A reply to the note");
    expect(body).not.toContain("Second note");
  });

  it("strips threads nested in an extra wrapper", async () => {
    const { body } = (
      await importHtml(
        docWithBody(`<p>Body text<sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup></p>
<div><div>
<p><a href="#cmnt_ref1" id="cmnt1">[a]</a><span>Reviewer note</span></p>
<p><span>A reply to the note</span></p>
</div></div>`)
      )
    ).version;

    expect(body).toContain("Body text");
    expect(body).not.toContain("Reviewer note");
    expect(body).not.toContain("A reply to the note");
  });

  it("strips replies of threads without a wrapper", async () => {
    const { body } = (
      await importHtml(
        docWithBody(`<p>Body text<sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup> and more<sup><a href="#cmnt2" id="cmnt_ref2">[b]</a></sup></p>
<p><a href="#cmnt_ref1" id="cmnt1">[a]</a><span>Reviewer note</span></p>
<p><span>A reply to the note</span></p>
<p><a href="#cmnt_ref2" id="cmnt2">[b]</a><span>Second note</span></p>`)
      )
    ).version;

    expect(body).toContain("Body text");
    expect(body).not.toContain("Reviewer note");
    expect(body).not.toContain("A reply to the note");
    expect(body).not.toContain("Second note");
  });

  it("keeps content in a div that holds a comment anchor", async () => {
    const { body } = (
      await importHtml(
        docWithBody(`<p>Body text<sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup></p>
<div>
<p>Wrapped content</p>
<p><a href="#cmnt_ref1" id="cmnt1">[a]</a><span>Reviewer note</span></p>
</div>`)
      )
    ).version;

    expect(body).toContain("Wrapped content");
    expect(body).not.toContain("Reviewer note");
  });

  it("keeps non-paragraph content after a thread", async () => {
    const { body } = (
      await importHtml(
        docWithBody(`<p>Body text<sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup></p>
<div>
<p><a href="#cmnt_ref1" id="cmnt1">[a]</a><span>Reviewer note</span></p>
<p><span>A reply to the note</span></p>
<h2>Heading after the note</h2>
</div>
<p><a href="#ftnt_ref1" id="ftnt1">[1]</a><span>Footnote text</span></p>`)
      )
    ).version;

    expect(body).toContain("Body text");
    expect(body).toContain("## Heading after the note");
    expect(body).toContain("Footnote text");
    expect(body).not.toContain("Reviewer note");
    expect(body).not.toContain("A reply to the note");
  });

  it("keeps links that only look like comment anchors", async () => {
    const { body } = (
      await importHtml(
        docWithBody(`<p>A <a href="#cmnt_ref9">stray link</a> to keep</p>
<p><a href="#cmnt_ref1" id="cmnt1">[a]</a><span>Unpaired anchor text</span></p>`)
      )
    ).version;

    expect(body).toContain("stray link");
    expect(body).toContain("to keep");
    expect(body).toContain("Unpaired anchor text");
  });

  it("keeps other text in the marker's sup", async () => {
    const { body } = (
      await importHtml(
        docWithBody(`<p>E=mc<sup>2<a href="#cmnt1" id="cmnt_ref1">[a]</a></sup> and more<sup><a href="#cmnt2" id="cmnt_ref2">[b]</a><a href="#cmnt3" id="cmnt_ref3">[c]</a></sup> text</p>
<div><p><a href="#cmnt_ref1" id="cmnt1">[a]</a><span>First note</span></p></div>
<div><p><a href="#cmnt_ref2" id="cmnt2">[b]</a><span>Second note</span></p></div>
<div><p><a href="#cmnt_ref3" id="cmnt3">[c]</a><span>Third note</span></p></div>`)
      )
    ).version;

    expect(body).toContain("E=mc<sup>2</sup> and more text");
    expect(body).not.toMatch(/\[[abc]\]|cmnt|<sup><\/sup>/);
    expect(body).not.toMatch(/First note|Second note|Third note/);
  });

  it("strips threads whose anchor is not in a paragraph", async () => {
    const { body } = (
      await importHtml(
        docWithBody(`<p>Body text<sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup></p>
<p>Another<sup><a href="#cmnt2" id="cmnt_ref2">[b]</a></sup></p>
<ul><li><a href="#cmnt_ref1" id="cmnt1">[a]</a><span>Note in a list</span></li></ul>
<div><a href="#cmnt_ref2" id="cmnt2">[b]</a><span>Bare note</span></div>`)
      )
    ).version;

    expect(body).toContain("Body text");
    expect(body).toContain("Another");
    expect(body).not.toContain("Note in a list");
    expect(body).not.toContain("Bare note");
  });

  it("reports private docs as forbidden", async () => {
    const signInPage = new Response(
      "<html><body>Sign in - accounts.google.com</body></html>",
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
    await expect(
      importGoogleDoc(new URL(DOC_URL), contextReturning(signInPage))
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("imports public docs that mention access errors", async () => {
    const result = await importGoogleDoc(
      new URL(DOC_URL),
      contextReturning(
        htmlResponse(
          "<html><body><p>Access denied: sign in at accounts.google.com</p></body></html>"
        )
      )
    );
    expect(result.version.body).toContain("Access denied");
  });

  it("reports rate limiting as a fetch error", async () => {
    await expect(
      importGoogleDoc(
        new URL(DOC_URL),
        contextReturning(htmlResponse("", { status: 429 }))
      )
    ).rejects.toMatchObject({ code: "fetch-error" });
  });

  it("reports missing docs as not found", async () => {
    const error = await importGoogleDoc(
      new URL(DOC_URL),
      contextReturning(htmlResponse("", { status: 404 }))
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImporterError);
    expect(error).toMatchObject({ code: "not_found" });
  });
});

describe("extractMedia", () => {
  it("leaves media from other hosts in place", () => {
    const myst = ":::iframe{src='https://form.typeform.com/to/x'}\n:::";
    expect(extractMedia(myst, new DiagnosticCollector())).toEqual({
      body: myst,
      media: [],
    });
  });

  it("replaces a single-quoted src without unbalancing its quotes", () => {
    const { body } = extractMedia(
      ":::image{src='https://drive.google.com/file/d/i1'}",
      new DiagnosticCollector()
    );
    expect(body).toMatch(/^:::image\{src='raven-media:\/\/\w+'\}$/);
  });

  it("handles unquoted and double-quoted src attributes", () => {
    const { body, media } = extractMedia(
      [
        `:::video{src=https://drive.google.com/file/d/v1}`,
        `:::audio{src="https://drive.google.com/file/d/a1"}`,
      ].join("\n"),
      new DiagnosticCollector()
    );
    const ULID = "[0-9A-HJKMNP-TV-Z]{26}";
    const match = body.match(
      new RegExp(
        `^:::video\\{src=raven-media://(${ULID})\\}\\n:::audio\\{src="raven-media://(${ULID})"\\}$`
      )
    );

    expect(match).not.toBeNull();
    const [, videoId, audioId] = match!;
    expect(videoId).not.toBe(audioId);
    expect(media.map((m) => m.figureType)).toEqual(["video", "audio"]);
  });
});

// Merged cells run through the pipeline on their own and are rendered back to
// HTML, so problems inside them are reported as diagnostics on the body.
describe("merged-cell tables", () => {
  it("keeps a stray ::: in a cell as text and reports it", async () => {
    const result = await importHtml(
      docWithMergedCell(paragraphs("text", ":::"))
    );
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic).toMatchObject({
      code: "unmatched-directive-close",
      severity: "error",
      path: ["body"],
    });
    expect(textAt(result.version.body, diagnostic.range)).toBe(":::");
  });

  it("keeps a :::media block without a src as text and reports it", async () => {
    const result = await importHtml(
      docWithMergedCell(
        paragraphs(":::media", ":type: image", "Caption", ":::")
      )
    );
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic).toMatchObject({
      code: "media-missing-attribute",
      severity: "error",
      path: ["body"],
    });
    expect(diagnostic.message).toContain("`:src:`");
    const marked = textAt(result.version.body, diagnostic.range);
    expect(marked).toContain(":type: image");
    expect(marked).toContain("Caption");
  });

  it("uses a :::title block from a cell and reports it", async () => {
    const result = await importHtml(
      docWithMergedCell(paragraphs(":::title", "Cell Title", ":::"))
    );
    const diagnostic = onlyDiagnostic(result);

    expect(result.version.title).toBe("Cell Title");
    expect(diagnostic).toMatchObject({
      code: "metadata-in-table",
      severity: "warning",
      path: ["body"],
    });
    expect(diagnostic.range).toBeDefined();
  });

  it("ignores a :::title block from a cell when the doc has one", async () => {
    const result = await importHtml(
      docWithMergedCell(
        paragraphs(":::title", "Cell Title", ":::"),
        paragraphs(":::title", "Doc Title", ":::")
      )
    );

    expect(result.version.title).toBe("Doc Title");
    expect(onlyDiagnostic(result).message).toContain("ignored");
  });

  it("points a cell's heading links at slugs, keeping a missing one as text", async () => {
    const result = await importHtml(
      docWithMergedCell(
        `<p><a href="#h.a">ok</a> <a href="#h.gone">gone</a></p>`,
        `<h2 id="h.a"><span>Results</span></h2>`
      )
    );
    const diagnostic = onlyDiagnostic(result);

    expect(result.version.body).toContain(`<a href="#results">ok</a> gone`);
    expect(diagnostic.code).toBe("heading-link-unresolved");
    expect(textAt(result.version.body, diagnostic.range)).toBe("gone");
  });

  it("keeps a typed :ref to a target outside the table as text", async () => {
    const result = await importHtml(
      docWithMergedCell(
        paragraphs("see :ref{#fig-a}"),
        paragraphs(":::figure{#fig-a}", "Caption", ":::")
      )
    );
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic).toMatchObject({
      code: "unresolved-ref-in-table",
      severity: "warning",
    });
    expect(textAt(result.version.body, diagnostic.range)).toBe(":ref{#fig-a}");
  });
});

describe("document content", () => {
  it("imports internal bookmark links", async () => {
    const result = await importHtml(
      docWithBody(
        `<a id="id.abc"></a>${paragraphs("Target")}` +
          `<p><span>see </span><a href="#id.abc">:ref</a></p>`
      )
    );
    expect(result.version.body).toContain("[](#abc)");
  });

  describe("heading links", () => {
    const headingIds = (myst: string) =>
      Array.from(
        mystToHtml({ myst }).matchAll(/<h\d id="([^"]*)"/g),
        (m) => m[1]
      );

    it("links to the slugs the renderer gives headings, without explicit ids", async () => {
      const result = await importHtml(
        docWithBody(
          `<h2 id="h.a"><span>It&#39;s&nbsp;own</span></h2>` +
            `<h3 id="h.b"><span>My Heading</span></h3>` +
            `<h3 id="h.c"><span>My Heading</span></h3>` +
            `<p><a href="#h.a">a</a> <a href="#h.b">b</a> <a href="#h.c">c</a></p>`
        )
      );
      const body = result.version.body;

      expect(body).toContain("### My Heading\n");
      expect(body).not.toContain("{#");
      expect(body).toContain(
        "[a](#itsown) [b](#my-heading) [c](#my-heading-1)"
      );
      expect(headingIds(body)).toEqual([
        "itsown",
        "my-heading",
        "my-heading-1",
      ]);
    });

    it("counts repeats as the renderer does", async () => {
      const result = await importHtml(
        docWithBody(
          `<h3 id="h.a">Step 1</h3><h3 id="h.b">Step</h3><h3 id="h.c">Step</h3>` +
            `<h3 id="h.d">Custom {#mine}</h3><h3 id="h.e">Custom</h3>` +
            `<p><a href="#h.c">c</a> <a href="#h.d">d</a> <a href="#h.e">e</a></p>`
        )
      );
      const body = result.version.body;

      expect(body).toContain("[c](#step-2) [d](#mine) [e](#custom)");
      expect(headingIds(body)).toEqual([
        "step-1",
        "step",
        "step-2",
        "mine",
        "custom",
      ]);
    });

    it.each([
      ["typed underscores that become emphasis", `<span>_Results_</span>`],
      [
        "a :ref that renders as its number",
        `<span>Methods </span><a href="https://doi.org/10.1/x">:ref</a>`,
      ],
      ["formatting", `<b>Bold</b><span> and </span><i>italic</i>`],
    ])(
      "slugs a heading with %s as the renderer does",
      async (_case, heading) => {
        const result = await importHtml(
          docWithBody(
            `<h2 id="h.a">${heading}</h2><p><a href="#h.a">link</a></p>`
          )
        );
        const body = result.version.body;
        const target = body.match(/\[link\]\(#([^)]+)\)/)?.[1];

        expect(target).toBeDefined();
        expect(headingIds(body)).toEqual([target]);
      }
    );

    describe("with content the renderer throws on", () => {
      const fileWithoutFilename = paragraphs(
        ":::media",
        ":type: file",
        ":src: https://example.com/a.pdf",
        ":::"
      );

      it("imports a doc without heading links", async () => {
        const result = await importHtml(
          docWithBody(
            fileWithoutFilename + `<h2 id="h.a"><span>Results</span></h2>`
          )
        );

        expect(result.version.body).toContain("## Results\n");
        expect(result.version.body).not.toContain("{#");
      });

      it("keeps heading links as text and reports why", async () => {
        const result = await importHtml(
          docWithBody(
            fileWithoutFilename +
              `<h2 id="h.a"><span>Results</span></h2>` +
              `<p><a href="#h.a">see</a></p>`
          )
        );
        const diagnostic = onlyDiagnostic(result);

        expect(result.version.body).toMatch(/\n\nsee\n$/);
        expect(diagnostic.code).toBe("heading-link-unresolved");
        expect(diagnostic.message).toContain("couldn't be rendered");
        expect(textAt(result.version.body, diagnostic.range)).toBe("see");
      });

      it("resolves links to headings with an author's id that are left", async () => {
        const result = await importHtml(
          docWithBody(
            fileWithoutFilename +
              paragraphs(":::ignore") +
              `<h2 id="h.a"><span>Draft {#gone}</span></h2>` +
              paragraphs(":::") +
              `<h2 id="h.b"><span>Results {#kept}</span></h2>` +
              `<p><a href="#h.a">a</a> <a href="#h.b">b</a></p>`
          )
        );

        expect(result.version.body).toMatch(/\n\na \[b\]\(#kept\)\n$/);
        expect(onlyDiagnostic(result).code).toBe("heading-link-unresolved");
      });
    });

    it("doesn't count headings dropped from the body", async () => {
      const result = await importHtml(
        docWithBody(
          paragraphs(":::ignore") +
            `<h2 id="h.a"><span>Results</span></h2>` +
            paragraphs(":::") +
            `<h2 id="h.b"><span>Results</span></h2>` +
            `<p><a href="#h.b">see</a></p>`
        )
      );
      const body = result.version.body;

      expect(body).toBe("## Results\n\n[see](#results)\n");
      expect(headingIds(body)).toEqual(["results"]);
    });

    it("keeps a link to a dropped heading as text and reports it", async () => {
      const result = await importHtml(
        docWithBody(
          paragraphs(":::ignore") +
            `<h2 id="h.a"><span>Draft</span></h2>` +
            paragraphs(":::") +
            `<p><a href="#h.a">see</a></p>`
        )
      );

      expect(result.version.body).toBe("see\n");
      expect(onlyDiagnostic(result).code).toBe("heading-link-unresolved");
    });

    it("keeps a link to a dropped heading with an author's id as text", async () => {
      const result = await importHtml(
        docWithBody(
          paragraphs(":::ignore") +
            `<h2 id="h.a"><span>Draft {#mine}</span></h2>` +
            paragraphs(":::") +
            `<p><a href="#h.a">see</a></p>`
        )
      );

      expect(result.version.body).toBe("see\n");
      expect(onlyDiagnostic(result).code).toBe("heading-link-unresolved");
    });

    it("leaves no Google heading ids in other fields", async () => {
      const result = await importHtml(
        docWithBody(
          paragraphs(":::abstract") +
            `<h2 id="h.a"><span>Summary</span></h2>` +
            paragraphs("Short.", ":::")
        )
      );

      expect(result.version.abstract).toContain("## Summary");
      expect(result.version.abstract).not.toContain("{#");
    });

    describe("with an abstract", () => {
      // thestacks.org renders both as one page, under a Purpose heading.
      const pageIds = ({ version }: ImportedPublicationInput) =>
        headingIds(`# Purpose\n\n${version.abstract}\n\n${version.body}`);

      it("links from the abstract to a heading in the body", async () => {
        const result = await importHtml(
          docWithBody(
            paragraphs(":::abstract") +
              `<p><a href="#h.a">see</a></p>` +
              paragraphs(":::") +
              `<h2 id="h.a"><span>Results</span></h2>`
          )
        );

        expect(result.version.abstract).toBe("[see](#results)");
        expect(pageIds(result)).toEqual(["purpose", "results"]);
      });

      it("counts repeats across the abstract and body, after Purpose", async () => {
        const result = await importHtml(
          docWithBody(
            paragraphs(":::abstract") +
              `<h2 id="h.a"><span>Results</span></h2>` +
              `<p><a href="#h.c">see</a></p>` +
              paragraphs(":::") +
              `<h2 id="h.b"><span>Results</span></h2>` +
              `<h2 id="h.c"><span>Purpose</span></h2>` +
              `<p><a href="#h.a">first</a> <a href="#h.b">second</a></p>`
          )
        );

        expect(result.version.abstract).toContain("[see](#purpose-1)");
        expect(result.version.body).toContain(
          "[first](#results) [second](#results-1)"
        );
        expect(pageIds(result)).toEqual([
          "purpose",
          "results",
          "results-1",
          "purpose-1",
        ]);
      });

      it("keeps a link to a missing heading in the abstract as text and reports it there", async () => {
        const result = await importHtml(
          docWithBody(
            paragraphs(":::abstract") +
              `<p><span>see </span><a href="#h.gone">there</a></p>` +
              paragraphs(":::")
          )
        );
        const diagnostic = onlyDiagnostic(result);

        expect(result.version.abstract).toBe("see there");
        expect(diagnostic).toMatchObject({
          code: "heading-link-unresolved",
          path: ["abstract"],
        });
        expect(textAt(result.version.abstract!, diagnostic.range)).toBe(
          "there"
        );
      });

      it("links from an abstract taken from a merged cell", async () => {
        const result = await importHtml(
          docWithMergedCell(
            paragraphs(":::abstract") +
              `<p><a href="#h.a">see</a></p>` +
              paragraphs(":::"),
            `<h2 id="h.a"><span>Results</span></h2>`
          )
        );

        expect(result.version.abstract).toBe("[see](#results)");
      });
    });

    describe.each(["see [results]", "a [b] [[c]] d"])(
      "with brackets in the label: %s",
      (label) => {
        it("links to the heading", async () => {
          const result = await importHtml(
            docWithBody(
              `<h2 id="h.a"><span>Results</span></h2>` +
                `<p><a href="#h.a">${label}</a></p>`
            )
          );

          expect(result.version.body).toBe(
            `## Results\n\n[${label}](#results)\n`
          );
        });

        it("keeps the whole label as text when the heading is missing", async () => {
          const result = await importHtml(
            docWithBody(`<p>see <a href="#h.gone">${label}</a></p>`)
          );
          const diagnostic = onlyDiagnostic(result);

          expect(result.version.body).toBe(`see ${label}\n`);
          expect(textAt(result.version.body, diagnostic.range)).toBe(label);
        });
      }
    );

    it("keeps a link to a missing heading as text and reports it", async () => {
      const result = await importHtml(
        docWithBody(`<p><span>see </span><a href="#h.gone">there</a></p>`)
      );
      const diagnostic = onlyDiagnostic(result);

      expect(result.version.body).toBe("see there\n");
      expect(diagnostic.code).toBe("heading-link-unresolved");
      expect(textAt(result.version.body, diagnostic.range)).toBe("there");
    });
  });

  it("unwraps Google redirect links", async () => {
    const wrapped =
      "https://www.google.com/url?q=https://example.com/page&amp;sa=D";
    const result = await importHtml(
      docWithBody(`<p><a href="${wrapped}">Example</a></p>`)
    );
    expect(result.version.body).toContain(
      "[Example](https://example.com/page)"
    );
  });
});

describe("directive nesting", () => {
  const nested = (depth: number) =>
    paragraphs(
      ...Array.from({ length: depth }, () => ":::callout"),
      "Innermost",
      ...Array.from({ length: depth }, () => ":::")
    );

  it("imports directives nested deeper than 4 levels", async () => {
    const result = await importHtml(docWithBody(nested(6)));
    const openers = result.version.body.match(/^:+(?=div)/gm);
    expect(openers?.map((colons) => colons.length)).toEqual([8, 7, 6, 5, 4, 3]);
  });

  it("imports deep nesting inside a merged cell", async () => {
    const result = await importHtml(docWithMergedCell(nested(6)));
    expect(result.version.body).toContain("Innermost");
  });

  it("imports directives nested to the maximum depth", async () => {
    const result = await importHtml(
      docWithBody(nested(MAXIMUM_ALLOWED_DIRECTIVE_DEPTH))
    );
    const openers = result.version.body.match(/^:+(?=div)/gm);

    expect(openers).toHaveLength(MAXIMUM_ALLOWED_DIRECTIVE_DEPTH);
    expect(openers?.[0]).toHaveLength(MAXIMUM_ALLOWED_DIRECTIVE_DEPTH + 2);
    expect(result.version.body).toContain("Innermost");
  });

  it("fails the import when directives nest past the maximum depth", async () => {
    const depth = MAXIMUM_ALLOWED_DIRECTIVE_DEPTH + 1;
    const error = await importHtml(docWithBody(nested(depth))).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(ImporterError);
    expect((error as ImporterError).details).toMatchObject({
      code: "validation",
      issues: [
        {
          code: "custom",
          message: "Maximum directive depth of 32 exceeded at 33 deep",
          path: ["body"],
        },
      ],
    });
    expect(error as ImporterError).toBeInstanceOf(MaximumDirectiveDepthError);
    expect(error as ImporterError).toMatchObject({ depth });
  });

  it("keeps a merged cell nested past the maximum depth as HTML", async () => {
    const result = await importHtml(
      docWithMergedCell(nested(MAXIMUM_ALLOWED_DIRECTIVE_DEPTH + 1))
    );
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic).toMatchObject({
      code: "cell-conversion-failed",
      severity: "error",
      path: ["body"],
    });
    expect(diagnostic.message).toContain(
      `Maximum directive depth of ${MAXIMUM_ALLOWED_DIRECTIVE_DEPTH} exceeded`
    );
    expect(textAt(result.version.body, diagnostic.range)).toContain(
      "Innermost"
    );
  });
});

describe("formatting classes", () => {
  it("applies classes whose names aren't valid CSS identifiers", async () => {
    const result = await importHtml(
      `<html><head><style>.1b{font-weight:700}</style></head><body>` +
        `<p><span class="1b">Bold</span><span> text</span></p></body></html>`
    );
    expect(result.version.body).toContain("**Bold**");
  });
});

describe("images", () => {
  it("leaves out an image with no src and reports it", async () => {
    const result = await importHtml(
      docWithBody(
        `<p><span>Before</span></p><p><img></p>${paragraphs("After")}`
      )
    );
    const diagnostic = onlyDiagnostic(result);

    expect(result.version.body).not.toContain("null");
    expect(result.media).toEqual([]);
    expect(diagnostic).toMatchObject({
      code: "image-missing-src",
      severity: "warning",
      path: ["body"],
    });
    expect(textAt(result.version.body, diagnostic.range)).toBe("");
  });

  it.each([
    [
      "table",
      docWithBody(
        `<table><tr><td>${paragraphs("a")}</td><td>${paragraphs("b")}</td></tr>` +
          `<tr><td>${paragraphs("c")}</td><td><p><img></p></td></tr></table>`
      ),
    ],
    ["merged-cell table", docWithMergedCell("<p><img></p>")],
  ])("reports an image with no src in a %s once", async (_, html) => {
    const result = await importHtml(html);
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic).toMatchObject({
      code: "image-missing-src",
      path: ["body"],
    });
    expect(textAt(result.version.body, diagnostic.range)).toBe("");
  });

  it("encodes characters that would break the src attribute", async () => {
    const src = "https://example.com/it's {a}.png";
    const result = await importHtml(docWithBody(`<p><img src="${src}"></p>`));
    expect(result.version.body).toContain(
      'src="https://example.com/it%27s%20%7Ba%7D.png"'
    );
  });
});

describe("line breaks", () => {
  const doc = docWithBody("<p><span>one</span><br><span>two</span></p>");

  it("starts a new paragraph at a single line break by default", async () => {
    const result = await importHtml(doc);
    expect(result.version.body).toBe("one\n\ntwo\n");
  });

  it("keeps a single line break within the paragraph when configured", async () => {
    const result = await importHtml(doc, { singleLineBreaks: "line-break" });
    expect(result.version.body).toMatch(/^one(\\| {2})\ntwo\n$/);
  });

  it("starts a new paragraph at two line breaks either way", async () => {
    const result = await importHtml(
      docWithBody("<p><span>one</span><br>\n<br><span>two</span></p>"),
      { singleLineBreaks: "line-break" }
    );
    expect(result.version.body).toBe("one\n\ntwo\n");
  });
});

describe("publication metadata", () => {
  it("reports problems inside :::abstract against the abstract", async () => {
    const result = await importHtml(
      docWithBody(
        paragraphs(":::abstract", "Intro.", ":::media", "Caption", ":::", ":::")
      )
    );
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic).toMatchObject({
      code: "media-missing-attribute",
      path: ["abstract"],
    });
    expect(textAt(result.version.abstract!, diagnostic.range)).toBe("Caption");
  });
});

describe("unusual exports", () => {
  it("imports tables and strikethrough inside :::abstract and :::title", async () => {
    const result = await importHtml(
      docWithBody(
        paragraphs(":::title", "A ~~struck~~ title", ":::", ":::abstract") +
          `<table><tr><td>${paragraphs("a")}</td></tr>` +
          `<tr><td>${paragraphs("b")}</td></tr></table>` +
          paragraphs(":::")
      )
    );

    expect(result.version.title).toContain("struck");
    expect(result.version.abstract).toContain("| a |");
  });

  it("reports an empty export instead of failing", async () => {
    const result = await importHtml("");
    expect(result.version.body).toBe("");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "empty-document", severity: "error" })
    );
  });
});

describe("brackets and parentheses in links", () => {
  const URL_A = "https://example.com/";
  const link = (label: string, href = URL_A) =>
    `<a href="${href}">${label}</a>`;
  const importBody = async (html: string) =>
    (await importHtml(docWithBody(html))).version.body;
  const rendered = (myst: string) => mystToHtml({ myst });
  /** Each rendered link's href and visible text. */
  const renderedLinks = (myst: string) =>
    Array.from(
      rendered(myst).matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g),
      ([, href, html]) => [href, html!.replace(/<[^>]+>/g, "")]
    );
  const visibleText = (myst: string) =>
    rendered(myst)
      .replace(/<[^>]+>/g, "")
      .trim();

  describe("escapes what would break the link", () => {
    it.each([
      ["an unmatched ]", "a ] b", "[a \\] b]"],
      ["an unmatched [", "[1", "[\\[1]"],
      ["an unmatched ] at the end", "fig 2]", "[fig 2\\]]"],
      ["brackets the wrong way round", "]x[", "[\\]x\\[]"],
      ["one extra [", "[[a]", "[\\[[a]]"],
      ["one extra ]", "[a]]", "[[a]\\]]"],
      ["a pair followed by ( that'd be a link", "[a](b)", "[\\[a\\](b)]"],
      ["a link-like pair mid-label", "x [a](b) y", "[x \\[a\\](b) y]"],
    ])("in the label: %s", async (_, label, expectedLabel) => {
      const body = await importBody(`<p>${link(label)}</p>`);

      expect(body).toBe(`${expectedLabel}(${URL_A})\n`);
      expect(renderedLinks(body)).toEqual([[URL_A, label]]);
      expect(visibleText(body)).toBe(label);
    });

    it.each([
      [
        "an unmatched (",
        "https://en.wikipedia.org/wiki/A_(b",
        "https://en.wikipedia.org/wiki/A_\\(b",
      ],
      [
        "an unmatched )",
        "https://example.com/a)b",
        "https://example.com/a\\)b",
      ],
      ["an extra )", "https://example.com/(a))", "https://example.com/(a)\\)"],
    ])("in the URL: %s", async (_, href, expectedHref) => {
      const body = await importBody(`<p>${link("text", href)}</p>`);

      expect(body).toBe(`[text](${expectedHref})\n`);
      expect(renderedLinks(body)).toEqual([[href, "text"]]);
    });

    it("in both the label and the URL", async () => {
      const href = "https://example.com/a)b";
      const body = await importBody(`<p>${link("a ] b", href)}</p>`);

      expect(body).toBe("[a \\] b](https://example.com/a\\)b)\n");
      expect(renderedLinks(body)).toEqual([[href, "a ] b"]]);
    });

    it("when the unmatched bracket is in a formatted part of the label", async () => {
      const body = await importBody(`<p>${link("<b>[bold</b> rest")}</p>`);

      expect(body).toBe(`[**\\[bold** rest](${URL_A})\n`);
      expect(renderedLinks(body)).toEqual([[URL_A, "[bold rest"]]);
    });

    it("outside typed code in the label, but not inside it", async () => {
      const body = await importBody(`<p>${link("`a]` b]")}</p>`);

      expect(body).toBe(`[\`a]\` b\\]](${URL_A})\n`);
      expect(renderedLinks(body)).toEqual([[URL_A, "a] b]"]]);
    });

    it("outside typed code containing a backtick, but not inside it", async () => {
      const body = await importBody(`<p>${link("run ``a`b]`` x]")}</p>`);

      expect(body).toBe(`[run \`\`a\`b]\`\` x\\]](${URL_A})\n`);
      expect(renderedLinks(body)).toEqual([[URL_A, "run a`b] x]"]]);
    });

    it("in a link to a bookmark", async () => {
      const body = await importBody(
        `<a id="id.abc"></a>${paragraphs("Target")}` +
          `<p>${link("fig 2]", "#id.abc")}</p>`
      );

      expect(body).toContain("[fig 2\\]](#abc)");
      expect(renderedLinks(body)).toEqual([["#abc", "fig 2]"]]);
    });

    it("in a link to a heading, which then resolves", async () => {
      const body = await importBody(
        `<h2 id="h.a"><span>Results</span></h2>` +
          `<p>${link("[x", "#h.a")}</p>`
      );

      expect(body).toBe("## Results\n\n[\\[x](#results)\n");
      expect(renderedLinks(body)).toEqual([["#results", "[x"]]);
    });

    it("in a link to a missing heading, keeping the whole label", async () => {
      const result = await importHtml(
        docWithBody(`<p>see ${link("[x", "#h.gone")}</p>`)
      );
      const diagnostic = onlyDiagnostic(result);

      expect(visibleText(result.version.body)).toBe("see [x");
      expect(textAt(result.version.body, diagnostic.range)).toBe("\\[x");
    });

    it.each([
      ["a heading", `<h2>${link("a ] b")}</h2>`, "a ] b"],
      ["a list item", `<ul><li><p>${link("a ] b")}</p></li></ul>`, "a ] b"],
      [
        "a table cell",
        `<table><tr><td>${paragraphs("h")}</td></tr><tr><td><p>${link("a ] b")}</p></td></tr></table>`,
        "a ] b",
      ],
    ])("in %s", async (_, html, label) => {
      const body = await importBody(html);

      expect(renderedLinks(body)).toEqual([[URL_A, label]]);
    });

    it("only in the link that needs it", async () => {
      const body = await importBody(
        `<p>${link("[1")} and ${link("see [2]", "https://example.org/")}</p>`
      );

      expect(body).toBe(
        `[\\[1](${URL_A}) and [see [2]](https://example.org/)\n`
      );
      expect(renderedLinks(body)).toEqual([
        [URL_A, "[1"],
        ["https://example.org/", "see [2]"],
      ]);
    });
  });

  describe("leaves alone", () => {
    it.each([
      ["a plain label", "Example"],
      ["matched brackets", "see [results]"],
      ["nested matched brackets", "a [b] [[c]] d"],
      ["a matched pair followed by a space and (", "[a] (b)"],
      ["parentheses", "a (b) c) d"],
    ])("%s in the label", async (_, label) => {
      const body = await importBody(`<p>${link(label)}</p>`);

      expect(body).toBe(`[${label}](${URL_A})\n`);
      expect(renderedLinks(body)).toEqual([[URL_A, label]]);
    });

    it.each([
      ["matched parentheses", "https://en.wikipedia.org/wiki/Foo_(bar)"],
      ["nested matched parentheses", "https://example.com/((a)b)"],
      ["brackets", "https://example.com/?q=[a"],
    ])("%s in the URL", async (_, href) => {
      const body = await importBody(`<p>${link("text", href)}</p>`);

      expect(body).toBe(`[text](${href})\n`);
      // The renderer percent-encodes brackets, which is the same URL.
      expect(renderedLinks(body)).toEqual([[encodeURI(href), "text"]]);
    });

    it("a DOI with parentheses in a :ref link", async () => {
      const doi = "https://doi.org/10.1016/S0092-8674(00)81683-9";
      const body = await importBody(`<p>see ${link(":ref", doi)}</p>`);

      expect(body).toBe(`see [](${doi})\n`);
    });

    it("brackets typed in prose", async () => {
      const body = await importBody(paragraphs("typed [x] and a ] stray ["));

      expect(body).toBe("typed [x] and a ] stray [\n");
    });

    it("a link typed as Markdown, which still works", async () => {
      const body = await importBody(
        paragraphs("see [typed](https://example.com/) here")
      );

      expect(renderedLinks(body)).toEqual([[URL_A, "typed"]]);
    });

    it.each([
      ["an unmatched ]", "run `a]`", "run a]"],
      ["an unmatched [", "run `[a`", "run [a"],
    ])("%s in typed code in the label", async (_, label, text) => {
      const body = await importBody(`<p>${link(label)}</p>`);

      expect(body).toBe(`[${label}](${URL_A})\n`);
      expect(renderedLinks(body)).toEqual([[URL_A, text]]);
    });

    it("a typed role in the label", async () => {
      const body = await importBody(`<p>${link("H:sub[2]O")}</p>`);

      expect(body).toBe(`[H:sub[2]O](${URL_A})\n`);
    });
  });
});

describe("hostile or unusual content", () => {
  it("removes characters the importer reserves for itself", async () => {
    const reserved = String.fromCharCode(0xe002);
    const result = await importHtml(docWithBody(paragraphs(`a${reserved}b`)));

    expect(result.version.body).toBe("ab\n");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "reserved-characters-removed" })
    );
  });

  it("keeps a bookmark on a heading, and the heading's own link", async () => {
    const result = await importHtml(
      docWithBody(
        `<a id="id.abc"></a><h2 id="h.a"><span>Results</span></h2>` +
          `<p><a href="#id.abc">a</a> <a href="#h.a">b</a></p>`
      )
    );
    const html = mystToHtml({ myst: result.version.body });

    expect(result.version.body).toContain("[a](#abc) [b](#results)");
    expect(html).toMatch(/<div id="abc"[^>]*>\s*<h2 id="results"/);
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "heading-link-unresolved" })
    );
  });

  it("keeps the content of a paragraph that has a bookmark id", async () => {
    const result = await importHtml(
      docWithBody(`<p id="id.abc"><span>Bookmarked</span></p>`)
    );
    expect(result.version.body).toMatch(/div\{#abc\}\nBookmarked\n/);
  });

  it("parses a stylesheet with an unclosed rule quickly", async () => {
    const css = ".a{color:red ".repeat(20000);
    const result = await importHtml(
      `<html><head><style>${css}</style></head><body>${paragraphs("Text")}</body></html>`
    );
    expect(result.version.body).toBe("Text\n");
  });

  it("keeps a flood of unclosed directives as text, quickly", async () => {
    const result = await importHtml(
      docWithBody(paragraphs(":ref{#".repeat(10000)))
    );
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic.code).toBe("too-many-unclosed-directives");
    expect(result.version.body.startsWith("\\:ref{#\\:ref{#")).toBe(true);
  });

  it("imports extremely deep nesting as plain text", async () => {
    const deep = `${"<b>".repeat(3000)}deep${"</b>".repeat(3000)}`;
    const result = await importHtml(
      docWithBody(`${paragraphs("before")}<p>${deep}</p>${paragraphs("after")}`)
    );
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic).toMatchObject({
      code: "document-too-deep",
      severity: "error",
    });
    expect(result.version.body).toBe("before\n\ndeep\n\nafter\n");
  });
});

describe("media sources", () => {
  // A 1x1 transparent PNG.
  const PIXEL =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  it("imports an embedded data: image as bytes media", async () => {
    const result = await importHtml(
      docWithBody(`<p><img src="data:image/png;base64,${PIXEL}"></p>`)
    );
    const [media] = result.media ?? [];

    expect(result.version.body).not.toContain("base64");
    expect(result.version.body).toContain(media!.ref);
    expect(media!.source).toEqual({
      type: "bytes",
      data: Buffer.from(PIXEL, "base64"),
      filename: "image-1.png",
      mimeType: "image/png",
    });
  });

  it("shares one media item between identical embedded images", async () => {
    const img = `<p><img src="data:image/png;base64,${PIXEL}"></p>`;
    const result = await importHtml(docWithBody(img + img));
    expect(result.media).toHaveLength(1);
  });

  it("reports embedded data it can't read", async () => {
    const result = await importHtml(
      docWithBody(`<p><img src="data:image/tiff;base64,${PIXEL}"></p>`)
    );
    const diagnostic = onlyDiagnostic(result);

    expect(result.media).toEqual([]);
    expect(diagnostic.code).toBe("media-invalid-data");
    expect(textAt(result.version.body, diagnostic.range)).toBe(
      `data:image/tiff;base64,${PIXEL}`
    );
  });

  it("reports the whole of a quoted source with spaces in it", async () => {
    const placeholder = "Paste the image URL here, don't convert it";
    const result = await importHtml(
      docWithBody(
        paragraphs(":::media", ":type: image", `:src: ${placeholder}`, ":::")
      )
    );
    const diagnostic = onlyDiagnostic(result);

    expect(diagnostic.code).toBe("media-invalid-src");
    expect(textAt(result.version.body, diagnostic.range)).toBe(placeholder);
  });

  it("reports a media source that isn't a full URL", async () => {
    const result = await importHtml(
      docWithBody(
        paragraphs(":::media", ":type: image", ":src: images/pic.png", ":::")
      )
    );
    const diagnostic = onlyDiagnostic(result);

    expect(result.media).toEqual([]);
    expect(diagnostic).toMatchObject({
      code: "media-invalid-src",
      severity: "warning",
      path: ["body"],
    });
    expect(textAt(result.version.body, diagnostic.range)).toBe(
      "images/pic.png"
    );
  });
});

describe("images inside headings and text", () => {
  const img = `<span><img src="https://lh3.googleusercontent.com/x"></span>`;

  it("splits a heading around an image and reports it", async () => {
    const result = await importHtml(
      docWithBody(`<h2><span>Foo</span>${img}<span>bar</span></h2>`)
    );
    const diagnostic = onlyDiagnostic(result);
    const body = result.version.body;

    expect(body).toMatch(/^## Foo\n\n:+figure\{type="img"\}\n/);
    expect(body).toMatch(/\n:+\n\n## bar\n$/);
    expect(diagnostic).toMatchObject({
      code: "image-moved-out-of-block",
      severity: "warning",
      path: ["body"],
    });
    expect(textAt(body, diagnostic.range)).toMatch(
      /^:+figure\{type="img"\}[\s\S]*\n:+$/
    );
  });

  it("moves an image that's alone in a heading out of it", async () => {
    const result = await importHtml(docWithBody(`<h2>${img}</h2>`));
    expect(result.version.body).not.toContain("#");
    expect(onlyDiagnostic(result).code).toBe("image-moved-out-of-block");
  });

  it("splits a paragraph around an image", async () => {
    const result = await importHtml(
      docWithBody(`<p><span>Foo </span>${img}<span> bar</span></p>`)
    );
    expect(result.version.body).toMatch(/^Foo\n\n:+figure/);
    expect(result.version.body).toMatch(/\n\nbar\n$/);
    expect(onlyDiagnostic(result).code).toBe("image-moved-out-of-block");
  });

  it("keeps a title's text from both sides of an image in one title", async () => {
    const result = await importHtml(
      docWithBody(
        `<p class="title"><span>Alpha </span>${img}<span>Beta</span></p>`
      )
    );
    expect(result.version.title).toBe("Alpha Beta");
    expect(result.version.body).toMatch(/^:+figure\{type="img"\}/);
    expect(result.version.body).not.toContain("Alpha");
    expect(onlyDiagnostic(result).code).toBe("image-moved-out-of-block");
  });

  it("keeps every span of a title that follows an image", async () => {
    const result = await importHtml(
      docWithBody(
        `<p class="title"><span>Alpha </span>${img}<span>Beta </span><span>Gamma</span></p>`
      )
    );
    expect(result.version.title).toBe("Alpha Beta Gamma");
  });

  it("keeps a title that only follows an image", async () => {
    const result = await importHtml(
      docWithBody(`<p class="title">${img}<span>Beta</span></p>`)
    );
    expect(result.version.title).toBe("Beta");
    expect(result.version.body).toMatch(/^:+figure\{type="img"\}/);
  });

  it("moves an image that's alone in a title into the body", async () => {
    const result = await importHtml(
      docWithBody(`<p class="title">${img}</p>${paragraphs("Body")}`)
    );
    expect(result.version.body).toMatch(/^:+figure\{type="img"\}/);
    expect(result.version.body).toMatch(/\n\nBody\n$/);
  });

  it("leaves a paragraph holding only an image alone", async () => {
    const result = await importHtml(docWithBody(`<p>${img}</p>`));
    expect(result.version.body).toMatch(/^:+figure/);
    expect(
      result.diagnostics?.filter(({ code }) => code !== "missing-title")
    ).toEqual([]);
  });
});
