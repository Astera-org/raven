import { importGoogleDoc } from "#src/index.js";
import {
  type ImportedPublicationInput,
  type ImporterContext,
  type SourceRange,
} from "@raven/core-import-format";
import {
  baseMarkdownToHtmlPipeline,
  mystToHtml,
  Platform,
  processMystSync,
} from "@raven/core-myst-renderer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import rehypeStringify from "rehype-stringify";
import { describe, expect, it } from "vitest";

// Real Google Docs exports. They live with the integration tests' fixtures,
// which media-mock serves, so both suites share one copy.
const FIXTURES_DIR = new URL(
  "../../../tests/fixtures/google-docs/",
  import.meta.url
);
const REAL_DOCS = [
  "Demo_Tardigrade",
  "Demo_Tardigrade_Updated",
  "DemoTheStacksTableTest",
  "Error-QuillNetsequence-guidedwidgetredesign",
  "Error-Countingsprocketsfromthetopdown",
  "FakeStackspubwithallelements",
  "HeaderLinkTest",
  "Stacksmathimporttest",
  "collapsible-sections-edge-cases-doc",
  "tardigrade-test",
];
// Bodies over this size are snapshotted as a summary, so diffs stay readable.
const SUMMARY_OVER_BYTES = 500_000;
const IMPORT_BUDGET_MS = 5_000;
// Diagnostics that mean the importer fell back instead of converting.
const FALLBACK_CODES = ["cell-conversion-failed", "document-too-deep"];

const imported = new Map<string, Promise<ImportedPublicationInput>>();

/** Imports each fixture once, shared by every test that reads it. */
function importFixture(name: string): Promise<ImportedPublicationInput> {
  let result = imported.get(name);
  if (!result) {
    result = importGoogleDoc(
      new URL(`https://docs.google.com/document/d/${name}/edit`),
      contextReturning(readFileSync(new URL(`${name}.html`, FIXTURES_DIR)))
    );
    imported.set(name, result);
  }
  return result;
}

function contextReturning(html: Buffer): ImporterContext {
  return {
    fetch: async () =>
      new Response(new Uint8Array(html), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": 'attachment; filename="Doc.html"',
        },
      }),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    signal: new AbortController().signal,
  };
}

/** Media refs are random ULIDs; number them in order of appearance instead. */
function normalizeMediaRefs<T>(value: T): T {
  const numbers = new Map<string, number>();
  const json = JSON.stringify(value).replace(
    /raven-media:\/\/[0-9A-HJKMNP-TV-Z]{26}/g,
    (ref) => {
      if (!numbers.has(ref)) numbers.set(ref, numbers.size + 1);
      return `raven-media://media-${numbers.get(ref)}`;
    }
  );
  return JSON.parse(json) as T;
}

/** Swaps each `bytes` source's data for its size and hash. */
function withSummarizedBytes(result: ImportedPublicationInput) {
  return {
    ...result,
    media: result.media?.map((media) => {
      if (media.source.type !== "bytes") return media;
      const { data, ...source } = media.source;
      return {
        ...media,
        source: {
          ...source,
          byteLength: data.byteLength,
          sha256: createHash("sha256").update(data).digest("hex"),
        },
      };
    }),
  };
}

function fieldText(result: ImportedPublicationInput, path: unknown[]) {
  const key = path[0] as "title" | "subtitle" | "abstract" | "body";
  return result.version[key] ?? undefined;
}

function textAt(text: string, range: SourceRange): string {
  const { startLine, startColumn, endLine, endColumn } = range;
  const lines = text.split("\n").slice(startLine - 1, endLine);
  lines[lines.length - 1] = lines.at(-1)!.slice(0, endColumn - 1);
  lines[0] = lines[0]!.slice(startColumn - 1);
  return lines.join("\n");
}

function isWithin(text: string, range: SourceRange): boolean {
  const lines = text.split("\n");
  const fits = (line: number, column: number) =>
    line >= 1 &&
    line <= lines.length &&
    column >= 1 &&
    column <= lines[line - 1]!.length + 1;
  return (
    fits(range.startLine, range.startColumn) &&
    fits(range.endLine, range.endColumn)
  );
}

function summarize(body: string) {
  const directives: Record<string, number> = {};
  for (const [, name] of body.matchAll(/^:{3,}(\w+)/gm)) {
    directives[name!] = (directives[name!] ?? 0) + 1;
  }
  return {
    bodyLength: body.length,
    headings: body.match(/^#{1,6} .*/gm) ?? [],
    directives,
    inlineDataImages: body.match(/data:image\//g)?.length ?? 0,
  };
}

describe.each(REAL_DOCS)("real doc %s", (name) => {
  it("imports within the time budget", async () => {
    const start = performance.now();
    await importFixture(name);
    expect(performance.now() - start).toBeLessThan(IMPORT_BUDGET_MS);
  });

  it("converts everything without falling back", async () => {
    const { diagnostics = [] } = await importFixture(name);
    const fallbacks = diagnostics.filter(({ code }) =>
      FALLBACK_CODES.includes(code)
    );
    expect(fallbacks).toEqual([]);
  });

  it("leaves no internal marker characters in the output", async () => {
    const { version } = await importFixture(name);
    for (const text of Object.values(version)) {
      if (typeof text === "string") {
        expect(text).not.toMatch(/[\uE000-\uE0FF]/);
      }
    }
  });

  it("puts every diagnostic range inside its field", async () => {
    const result = await importFixture(name);
    for (const { path = [], range } of result.diagnostics ?? []) {
      if (!range) continue;
      const text = fieldText(result, path);
      expect(text, `no field for ${path.join(".")}`).toBeDefined();
      expect(isWithin(text!, range)).toBe(true);
    }
  });

  it("produces a body the renderer accepts", async () => {
    const { version } = await importFixture(name);
    const processor = baseMarkdownToHtmlPipeline(Platform.Web).use(
      rehypeStringify
    );
    expect(() => processMystSync(version.body, processor)).not.toThrow();
  });

  it("matches the snapshot", async () => {
    const result = normalizeMediaRefs(
      withSummarizedBytes(await importFixture(name))
    );
    const { body, ...version } = result.version;
    const isLarge = body.length > SUMMARY_OVER_BYTES;
    const snapshot = {
      version,
      ...(isLarge && { summary: summarize(body) }),
      media: result.media,
      diagnostics: result.diagnostics,
    };

    await expect(JSON.stringify(snapshot, null, 2) + "\n").toMatchFileSnapshot(
      `__snapshots__/real-docs/${name}.json`
    );
    if (!isLarge) {
      await expect(body).toMatchFileSnapshot(
        `__snapshots__/real-docs/${name}.md`
      );
    }
  });
});

// Titles come from Google's "Title" paragraph style (the `title` class), not
// from being first, and keep inline formatting as markdown like the rest of
// Raven's title handling (e.g. DataCite gets `markdownToText(title)`).
describe("titles", () => {
  it("keeps formatting in the title, e.g. an italic genus name", async () => {
    const { version } = await importFixture("FakeStackspubwithallelements");
    expect(version.title).toMatch(/^Heat tolerance .* _Saccharomyces_/);
  });

  it("finds the Title paragraph when it isn't the first block", async () => {
    const { version } = await importFixture(
      "Error-Countingsprocketsfromthetopdown"
    );
    expect(version.title).toBe("Counting sprockets from the top down");
  });

  it("doesn't treat a leading Heading 1 as the title", async () => {
    const { version, diagnostics = [] } = await importFixture(
      "Stacksmathimporttest"
    );
    expect(version.body).toMatch(/^# Math import test/);
    expect(diagnostics.map(({ code }) => code)).toContain("missing-title");
  });
});

describe("images inside headings", () => {
  it("keeps QuillNet's heading images out of the heading line", async () => {
    const { version, diagnostics = [] } = await importFixture(
      "Error-QuillNetsequence-guidedwidgetredesign"
    );
    const codes = diagnostics.map(({ code }) => code);

    expect(version.body).not.toMatch(/^#{1,6} :::/m);
    expect(codes).not.toContain("unmatched-directive-close");
    expect(codes.filter((c) => c === "image-moved-out-of-block")).toHaveLength(
      2
    );
  });
});

describe("heading links", () => {
  it("points picker links at the ids the renderer gives repeated headings", async () => {
    const { version } = await importFixture("HeaderLinkTest");
    const html = mystToHtml({ myst: version.body });
    const headingIds = Array.from(
      html.matchAll(/<h\d id="([^"]*)"/g),
      (m) => m[1]
    );

    // "My Heading!" slugs like "My Heading", so it takes the `-1` between
    // the two plain ones.
    const links = Array.from(
      version.body.matchAll(/\[(\w+)\]\(#([^)]*)\)/g),
      ([, text, target]) => [text, target]
    );
    expect(links).toEqual([
      ["ipsum", "my-heading"],
      ["amet", "my-heading-2"],
      ["adipiscing", "my-heading-1"],
    ]);
    expect(headingIds).toEqual([
      "top",
      "its-own",
      "my-heading",
      "the-other",
      "my-heading-1",
      "my-heading-2",
      "conclusion",
    ]);
  });
});

describe("embedded data: images", () => {
  it.each([
    ["Error-QuillNetsequence-guidedwidgetredesign", 7],
    ["Error-Countingsprocketsfromthetopdown", 7],
  ])("imports %s's images as bytes media", async (name, count) => {
    const { version, media = [] } = await importFixture(name);
    const bytes = media.filter(({ source }) => source.type === "bytes");

    expect(version.body).not.toContain("data:image/");
    expect(bytes).toHaveLength(count);
    for (const { ref } of bytes) expect(version.body).toContain(ref);
  });
});

describe("media sources", () => {
  it("covers the whole src in a media-invalid-src range", async () => {
    const result = await importFixture(
      "Error-QuillNetsequence-guidedwidgetredesign"
    );
    const invalid = (result.diagnostics ?? []).filter(
      ({ code }) => code === "media-invalid-src"
    );
    expect(invalid).toHaveLength(8);
    for (const { range } of invalid) {
      expect(textAt(result.version.body, range!)).toBe(
        "Paste the Google Drive URL of the image file, don't convert to smart chip"
      );
    }
  });
});
