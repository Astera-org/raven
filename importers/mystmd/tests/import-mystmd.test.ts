import { importMystmd } from "#src/lib/import-mystmd.js";
import { ImporterError } from "@raven/core-import-format";
import { describe, expect, it } from "vitest";

describe("importMystmd", () => {
  it("maps frontmatter to fields and keeps the rest as the body", () => {
    const source = [
      "---",
      "title: A *study*",
      "subtitle: Of things",
      "abstract: |",
      "  The **abstract**.",
      "license: CC-BY-4.0",
      "keywords: [ravens, crows]",
      "doi: 10.1234/abc",
      "authors:",
      "  - name: Ada Lovelace",
      "    email: ada@example.com",
      "---",
      "",
      "Body with {cite}`ref`.",
      "",
      "```{note}",
      "A note",
      "```",
      "",
    ].join("\n");

    expect(importMystmd(source, { filename: "paper.md" })).toEqual({
      publication: {
        doi: "10.1234/abc",
        license: "CC BY",
        tags: ["ravens", "crows"],
      },
      version: {
        title: "A *study*",
        subtitle: "Of things",
        abstract: "The **abstract**.",
        body: "Body with {cite}`ref`.\n\n```{note}\nA note\n```",
        frontmatter: null,
      },
      importDocument: {
        format: "mystmd",
        body: source,
        url: null,
        filename: "paper.md",
      },
      contributors: [
        {
          user: [{ by: "email", value: "ada@example.com" }],
          displayName: "Ada Lovelace",
          roles: [],
        },
      ],
    });
  });

  it("returns empty fields for a document without frontmatter", () => {
    expect(importMystmd("Just text.")).toMatchObject({
      publication: { doi: null, license: undefined, tags: [] },
      version: {
        title: null,
        subtitle: null,
        abstract: null,
        body: "Just text.",
        frontmatter: null,
      },
      importDocument: { filename: null },
      contributors: [],
    });
  });

  it("reads authors' ORCID iDs, emails and CRediT roles, leaving out collaborations", () => {
    const { contributors } = importMystmd(
      [
        "---",
        "authors:",
        "  - name: Josiah Carberry",
        "    orcid: https://orcid.org/0000-0002-1825-0097",
        "    email: josiah@example.com",
        "    roles: [conceptualization, writing – original draft]",
        "  - name: The Corvid Consortium",
        "    collaboration: true",
        "  - name: Ada Lovelace",
        "    roles: Software; Critical feedback",
        "---",
        "",
        "Text.",
        "",
      ].join("\n")
    );

    expect(contributors).toEqual([
      {
        user: [
          { by: "orcid", value: "0000-0002-1825-0097" },
          { by: "email", value: "josiah@example.com" },
        ],
        displayName: "Josiah Carberry",
        roles: ["Conceptualization", "Writing – original draft"],
      },
      {
        user: [{ by: "fullname", value: "Ada Lovelace" }],
        displayName: "Ada Lovelace",
        roles: ["Software", "Critical feedback"],
      },
    ]);
  });

  it("uses a leading H1 as the title and removes it from the body", () => {
    const { version } = importMystmd("# Hello *world*\n\nText.\n");

    expect(version.title).toBe("Hello world");
    expect(version.body).toBe("Text.");
  });

  it("removes a leading H1 that repeats the frontmatter title", () => {
    const { version } = importMystmd(
      "---\ntitle: Hello\n---\n\n# Hello\n\nText.\n"
    );

    expect(version.title).toBe("Hello");
    expect(version.body).toBe("Text.");
  });

  it("keeps a leading H1 that differs from the frontmatter title", () => {
    const { version } = importMystmd(
      "---\ntitle: Hello\n---\n\n# Other\n\nText.\n"
    );

    expect(version.title).toBe("Hello");
    expect(version.body).toBe("# Other\n\nText.");
  });

  it("doesn't take the title from a heading that isn't a leading H1", () => {
    const { version } = importMystmd(
      "Intro.\n\n# Heading\n\n## Section\n\nText.\n"
    );

    expect(version.title).toBeNull();
    expect(version.body).toBe("Intro.\n\n# Heading\n\n## Section\n\nText.");
  });

  it("doesn't take the title from a leading H2", () => {
    const { version } = importMystmd("## Methods\n\nText.\n");

    expect(version.title).toBeNull();
    expect(version.body).toBe("## Methods\n\nText.");
  });

  it("uses a leading H1 after frontmatter without a title", () => {
    const { version } = importMystmd(
      "---\nsubtitle: S\n---\n\n# Heading\n\nText.\n"
    );

    expect(version.title).toBe("Heading");
    expect(version.body).toBe("Text.");
  });

  it("takes the abstract from an abstract part and removes it from the body", () => {
    const { version } = importMystmd(
      [
        "# Title",
        "",
        '+++ {"part": "abstract"}',
        "",
        "First paragraph.",
        "",
        "Second paragraph.",
        "",
        "+++",
        "",
        "Body.",
      ].join("\n")
    );

    expect(version.title).toBe("Title");
    expect(version.abstract).toBe("First paragraph.\n\nSecond paragraph.");
    expect(version.body).toBe("+++\n\nBody.");
  });

  it("prefers the frontmatter abstract but still removes an abstract part", () => {
    const { version } = importMystmd(
      [
        "---",
        "abstract: From frontmatter.",
        "---",
        '+++ {"part": "abstract"}',
        "From the body.",
        "+++",
        "Body.",
      ].join("\n")
    );

    expect(version.abstract).toBe("From frontmatter.");
    expect(version.body).toBe("+++\nBody.");
  });

  it("corrects near-SPDX license IDs", () => {
    expect(
      importMystmd("---\nlicense: CC-BY\n---\nx").publication?.license
    ).toBe("CC BY");
  });

  it("rejects a license a publication can't store, at its field", () => {
    expect(() =>
      importMystmd("---\nlicense: All rights reserved\n---\nx")
    ).toThrow(
      expect.objectContaining({
        details: {
          code: "validation",
          issues: [
            expect.objectContaining({
              path: ["license"],
              message: expect.stringContaining('"All rights reserved"'),
            }),
          ],
        },
      })
    );
  });

  it("rejects keywords too long to store, at their index", () => {
    expect(() =>
      importMystmd(`---\nkeywords: [ok, ${"k".repeat(256)}]\n---\nx`)
    ).toThrow(
      expect.objectContaining({
        details: {
          code: "validation",
          issues: [
            expect.objectContaining({
              path: ["keywords", 1],
              message: "Keywords can be at most 255 characters",
            }),
          ],
        },
      })
    );
  });

  it("splits comma-separated keywords", () => {
    expect(
      importMystmd("---\nkeywords: a, b\n---\nx").publication?.tags
    ).toEqual(["a", "b"]);
  });

  it("keeps CRLF line endings in the body", () => {
    expect(
      importMystmd("---\r\ntitle: T\r\n---\r\nOne\r\n\r\nTwo\r\n").version.body
    ).toBe("One\r\n\r\nTwo");
  });

  it("rejects invalid YAML frontmatter", () => {
    expect(() => importMystmd("---\ntitle: [\n---\nx")).toThrow(ImporterError);
  });

  it("rejects an invalid DOI", () => {
    expect(() => importMystmd("---\ndoi: nope\n---\nx")).toThrow(/valid DOI/);
  });

  it("keeps numbering and math as the version's frontmatter, out of the body", () => {
    const source = [
      "---",
      "title: A study",
      "numbering:",
      "  headings: true",
      "math:",
      "  '\\R': '\\mathbb{R}'",
      "---",
      "",
      "Body.",
    ].join("\n");

    const { version } = importMystmd(source);

    expect(version.body).toBe("Body.");
    expect(version.frontmatter).toEqual({
      numbering: {
        heading_1: { enabled: true },
        heading_2: { enabled: true },
        heading_3: { enabled: true },
        heading_4: { enabled: true },
        heading_5: { enabled: true },
        heading_6: { enabled: true },
      },
      math: { "\\R": { macro: "\\mathbb{R}" } },
    });
  });
});
