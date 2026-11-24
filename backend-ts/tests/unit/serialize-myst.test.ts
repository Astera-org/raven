import {
  type MystDocumentFields,
  serializeMyst,
} from "#src/lib/myst/serialize-myst.js";
import { licenseToSpdx } from "#src/lib/utils/licenses.js";
import { importMystmd } from "@raven/importer-mystmd";
import { describe, expect, it } from "vitest";

const EMPTY: MystDocumentFields = {
  title: undefined,
  subtitle: undefined,
  abstract: undefined,
  license: undefined,
  keywords: [],
  doi: undefined,
  body: "",
};

/** The fields `importMystmd` reads from `source`, in `serializeMyst`'s terms. */
function readBack(source: string): MystDocumentFields {
  const { publication, version } = importMystmd(source);
  return {
    title: version.title ?? undefined,
    subtitle: version.subtitle ?? undefined,
    abstract: version.abstract ?? undefined,
    license: licenseToSpdx(publication?.license) ?? undefined,
    keywords: publication?.tags ?? [],
    doi: publication?.doi ?? undefined,
    body: version.body,
  };
}

describe("serializeMyst", () => {
  it("writes the fields as frontmatter before the body", () => {
    expect(
      serializeMyst({
        title: "A study",
        subtitle: "Of things",
        abstract: "The abstract.",
        license: "CC-BY-4.0",
        keywords: ["ravens", "crows"],
        doi: "10.1234/abc",
        body: "Body.",
      })
    ).toBe(
      [
        "---",
        "title: A study",
        "subtitle: Of things",
        "abstract: The abstract.",
        "license: CC-BY-4.0",
        "keywords:",
        "  - ravens",
        "  - crows",
        "doi: 10.1234/abc",
        "---",
        "",
        "Body.",
        "",
      ].join("\n")
    );
  });

  it("writes only the body when there are no fields", () => {
    expect(serializeMyst({ ...EMPTY, body: "Just text." })).toBe(
      "Just text.\n"
    );
  });

  it.each<[string, MystDocumentFields]>([
    [
      "markdown and YAML-significant characters",
      {
        ...EMPTY,
        title: "*Ravens*: a study # of crows",
        subtitle: "- not a list",
        keywords: ["yes", "123", "a: b"],
        body: "Body.",
      },
    ],
    [
      "a multi-paragraph abstract",
      {
        ...EMPTY,
        title: "T",
        abstract: "First **paragraph**.\n\nSecond paragraph.",
        body: "Body.",
      },
    ],
    [
      "a body with MyST syntax and its own headings",
      {
        ...EMPTY,
        title: "T",
        body: "## Methods\n\n```{note}\nA note\n```\n\n+++\n\nMore with {cite}`ref`.",
      },
    ],
    [
      "an untitled body starting with a lower heading",
      { ...EMPTY, body: "## Methods\n\nText." },
    ],
    [
      "a body starting with an H1 that differs from the title",
      { ...EMPTY, title: "Title", body: "# Another heading\n\nText." },
    ],
  ])("round-trips %s", (_, fields) => {
    expect(readBack(serializeMyst(fields))).toEqual(fields);
  });

  it("trims an abstract when read back", () => {
    const fields = { ...EMPTY, abstract: "  An abstract.\n\n", body: "B" };

    expect(readBack(serializeMyst(fields)).abstract).toBe("An abstract.");
  });

  it("moves a leading H1 of an untitled body into the title when read back", () => {
    const fields = { ...EMPTY, body: "# Heading\n\nText." };

    expect(readBack(serializeMyst(fields))).toMatchObject({
      title: "Heading",
      body: "Text.",
    });
  });

  it("drops a leading H1 that repeats the title when read back", () => {
    const fields = { ...EMPTY, title: "Title", body: "# Title\n\nText." };

    expect(readBack(serializeMyst(fields))).toEqual({
      ...fields,
      body: "Text.",
    });
  });
});

describe("serializeMyst with frontmatter", () => {
  it("writes numbering and math so they read back the same", () => {
    const frontmatter = {
      numbering: { heading_1: { enabled: true }, heading_2: { enabled: true } },
      math: { "\\R": { macro: "\\mathbb{R}" } },
    };

    const source = serializeMyst({ ...EMPTY, frontmatter, body: "Body." });

    expect(importMystmd(source).version.frontmatter).toEqual(frontmatter);
  });
});
