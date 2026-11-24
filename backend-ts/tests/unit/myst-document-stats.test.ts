import { buildPublicationMdast } from "#src/lib/myst/build-publication-mdast.js";
import { mdastStats } from "#src/lib/myst/document-stats.js";
import { describe, expect, it } from "vitest";

describe("mdastStats", () => {
  it("counts body sections and media the way the TOC and figures do", () => {
    const { tree } = buildPublicationMdast({
      abstract: "## Not a section\n\nThe abstract.",
      body: [
        "# Introduction",
        "## Methods",
        "### Too deep",
        ":::{note}",
        "## Inside a note",
        ":::",
        "```{figure} https://example.org/a.png",
        "A.",
        "```",
        "![b](https://example.org/b.jpg)",
        "![clip](https://example.org/clip.mp4)",
        "![talk](https://example.org/talk.mp3)",
        "```{iframe} https://example.org/embed",
        "```",
        "```{list-table}",
        "* - a",
        "```",
        "| x |\n|---|\n| 1 |",
      ].join("\n\n"),
    });

    expect(mdastStats(tree)).toEqual({
      sections: 2,
      images: 2,
      videos: 1,
      audio: 1,
      iframes: 1,
      tables: 2,
    });
  });
});
