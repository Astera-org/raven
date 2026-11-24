import {
  createMdastCache,
  mdastCacheKey,
  MdastUnavailableError,
  withMessages,
} from "#src/lib/myst/mdast-cache.js";
import { MYST_AST_VERSION } from "#src/lib/myst/versions.js";
import { describe, expect, it } from "vitest";

const SOURCE = {
  abstract: "Cites [](https://doi.org/10.1038/Nature12373).",
  body: "## Methods\n\nAnd [](https://example.org/report).",
};

const BIBLIOGRAPHY = {
  files: [
    {
      filename: "refs.bib",
      content: "@book{jones2019, title = {A book}, year = {2019}}",
    },
  ],
};

function cache(options: { maxBytes?: number; maxSourceBytes?: number } = {}) {
  return createMdastCache({
    maxBytes: options.maxBytes ?? 1024 * 1024,
    maxSourceBytes: options.maxSourceBytes ?? 1024 * 1024,
  });
}

describe("mdastCacheKey", () => {
  it("is stable for the same source and tells the fields apart", () => {
    expect(mdastCacheKey(SOURCE)).toBe(mdastCacheKey({ ...SOURCE }));
    expect(mdastCacheKey({ abstract: "ab", body: "c" })).not.toBe(
      mdastCacheKey({ abstract: "a", body: "bc" })
    );
    expect(mdastCacheKey({ abstract: null, body: undefined })).toBe(
      mdastCacheKey({ abstract: "", body: "" })
    );
  });

  it("changes with the bibliography", () => {
    expect(mdastCacheKey({ ...SOURCE, bibliography: BIBLIOGRAPHY })).not.toBe(
      mdastCacheKey(SOURCE)
    );
    expect(mdastCacheKey({ ...SOURCE, bibliography: null })).toBe(
      mdastCacheKey(SOURCE)
    );
  });
});

describe("withMessages", () => {
  it("adds messages to a serialised payload", () => {
    const messages = [{ severity: "warning" as const, message: "Hm" }];

    expect(JSON.parse(withMessages('{"schema":1}', messages))).toEqual({
      schema: 1,
      messages,
    });
  });
});

describe("createMdastCache", () => {
  it("builds the payload at the current version and serves it from memory", () => {
    const mdast = cache();

    const first = mdast.get(SOURCE);

    expect(first.key).toBe(mdastCacheKey(SOURCE));
    expect(JSON.parse(first.json)).toMatchObject({
      version: MYST_AST_VERSION,
      tree: { type: "root" },
    });
    expect(JSON.parse(first.json)).not.toHaveProperty("messages");
    expect(mdast.get({ ...SOURCE })).toBe(first);
  });

  it("returns the citation order of the AST", () => {
    const mdast = cache();

    const urls = mdast.referenceUrls(SOURCE);

    expect(urls).toEqual([
      "https://doi.org/10.1038/nature12373",
      "https://example.org/report",
    ]);
    expect(urls).toEqual(JSON.parse(mdast.get(SOURCE).json).citations.order);
  });

  it("leaves a cited entry with no DOI or URL out of the reference URLs", () => {
    const mdast = cache();
    const content = {
      abstract: "",
      body: "Cites {cite}`jones2019` and [](https://example.org/report).",
      bibliography: BIBLIOGRAPHY,
    };

    expect(mdast.referenceUrls(content)).toEqual([
      "https://example.org/report",
    ]);
    expect(JSON.parse(mdast.get(content).json).citations.order).toEqual([
      "jones2019",
      "https://example.org/report",
    ]);
    expect(mdast.get(content).citedKeys).toEqual(["jones2019"]);
  });

  it("keeps the cited entries beside the AST, so a read need not reparse", () => {
    const mdast = cache();
    const content = {
      abstract: "",
      body: "Cites {cite}`jones2019`.",
      bibliography: BIBLIOGRAPHY,
    };

    const entry = mdast.get(content);

    expect(Object.keys(entry.citedEntries)).toEqual(["jones2019"]);
    expect(entry.citedEntries.jones2019).toMatchObject({ title: "A book" });
    expect(entry.citedEntriesBytes).toBe(
      Buffer.byteLength(JSON.stringify(entry.citedEntries))
    );
  });

  it("leaves an uncited entry out of the cited entries", () => {
    const mdast = cache();

    expect(
      mdast.get({ ...SOURCE, bibliography: BIBLIOGRAPHY }).citedEntries
    ).toEqual({});
  });

  it("charges the cited entries to the budget", () => {
    const content = {
      abstract: "",
      body: "Cites {cite}`jones2019`.",
      bibliography: BIBLIOGRAPHY,
    };
    const built = cache().get(content);
    const jsonBytes = Buffer.byteLength(built.json);
    expect(built.citedEntriesBytes).toBeGreaterThan(0);

    // The AST alone fits; the AST with its cited entries does not.
    const tooSmall = cache({ maxBytes: jsonBytes + 1 });
    expect(tooSmall.get(content)).not.toBe(tooSmall.get(content));

    const big = cache({ maxBytes: jsonBytes + built.citedEntriesBytes + 1 });
    expect(big.get(content)).toBe(big.get(content));
  });

  it("evicts the least recently used AST when over budget", () => {
    const other = { abstract: "", body: "Another body." };
    const size = Buffer.byteLength(cache().get(SOURCE).json);
    const mdast = cache({ maxBytes: size + 10 });

    const first = mdast.get(SOURCE);
    mdast.get(other);

    expect(mdast.get(SOURCE)).not.toBe(first);
  });

  it("builds every time when the budget is 0", () => {
    const mdast = cache({ maxBytes: 0 });

    const first = mdast.get(SOURCE);

    expect(mdast.get(SOURCE)).not.toBe(first);
    expect(mdast.get(SOURCE).json).toBe(first.json);
  });

  it("refuses to build an oversized source", () => {
    const mdast = cache({ maxSourceBytes: 10 });

    expect(() => mdast.get({ abstract: "12345", body: "678901" })).toThrow(
      expect.objectContaining({
        constructor: MdastUnavailableError,
        reason: "too-large",
      })
    );
    expect(() => mdast.get({ abstract: "12345", body: "67890" })).not.toThrow();
  });
});
