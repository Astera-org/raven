import { type VersionBibliography } from "#src/db/schema.js";
import {
  draftEtag,
  type DraftEtagFields,
} from "#v1/routes/publications/helpers/draft-etag.js";
import { describe, expect, it } from "vitest";

const draft: DraftEtagFields = {
  title: "A title",
  subtitle: null,
  abstract: "An abstract",
  body: "Some body",
  license: "CC BY",
  tags: ["one", "two"],
};

const bibliography: VersionBibliography = {
  files: [
    { filename: "refs.bib", content: "@article{smith2020,\n}\n" },
    { filename: "more.bib", content: "@book{jones2019,\n}\n" },
  ],
};

describe("draftEtag", () => {
  it("is unchanged for a draft without a bibliography", () => {
    // The value drafts hashed to before bibliographies existed, so ETags
    // stored by earlier CLI pushes still match.
    expect(draftEtag(draft)).toBe(
      '"sY1NK_91M1KR5X-AR3o1HlSCSR0jvhZukhudfS8CdNg"'
    );
  });

  it.each([null, undefined, { files: [] }])(
    "treats %s as no bibliography",
    (empty) => {
      expect(draftEtag({ ...draft, bibliography: empty })).toBe(
        draftEtag(draft)
      );
    }
  );

  it("changes when a bibliography is added", () => {
    expect(draftEtag({ ...draft, bibliography })).not.toBe(draftEtag(draft));
  });

  it("changes when a file's content changes", () => {
    const edited = {
      files: [
        { ...bibliography.files[0]!, content: "@article{smith2021,\n}\n" },
        bibliography.files[1]!,
      ],
    };
    expect(draftEtag({ ...draft, bibliography: edited })).not.toBe(
      draftEtag({ ...draft, bibliography })
    );
  });

  it("changes when a file is renamed", () => {
    const renamed = {
      files: [
        { ...bibliography.files[0]!, filename: "bib/refs.bib" },
        bibliography.files[1]!,
      ],
    };
    expect(draftEtag({ ...draft, bibliography: renamed })).not.toBe(
      draftEtag({ ...draft, bibliography })
    );
  });

  it("changes when the files are reordered, since later keys win", () => {
    const reordered = { files: [...bibliography.files].reverse() };
    expect(draftEtag({ ...draft, bibliography: reordered })).not.toBe(
      draftEtag({ ...draft, bibliography })
    );
  });

  describe("frontmatter", () => {
    const frontmatter = {
      numbering: { heading_1: { enabled: true }, heading_2: { enabled: true } },
      math: { "\\R": { macro: "\\mathbb{R}" } },
    };

    it.each([null, undefined, {}])("treats %s as no frontmatter", (empty) => {
      expect(draftEtag({ ...draft, frontmatter: empty })).toBe(
        draftEtag(draft)
      );
    });

    it("changes when frontmatter is added", () => {
      expect(draftEtag({ ...draft, frontmatter })).not.toBe(draftEtag(draft));
    });

    it("ignores key order, which MySQL normalises", () => {
      const reordered = {
        math: frontmatter.math,
        numbering: {
          heading_2: { enabled: true },
          heading_1: { enabled: true },
        },
      };
      expect(draftEtag({ ...draft, frontmatter: reordered })).toBe(
        draftEtag({ ...draft, frontmatter })
      );
    });
  });
});
