import { describe, expect, it } from "vitest";
import {
  findLocalFiles,
  findUnrewritable,
  mediaPath,
  rewriteMedia,
} from "./index.js";

function targets(source: string): string[] {
  return findLocalFiles(source).media.map((m) => m.target);
}

describe("findLocalFiles", () => {
  it("finds inline, reference-style and HTML images", () => {
    const source = [
      '![A plot](figures/plot.png "Title")',
      "![Logo](<logo with space.svg>)",
      "",
      "![Ref][map]",
      "",
      "[map]: ./map.png",
      "",
      '<img src="./photo.jpg" alt="x">',
    ].join("\n");

    const { media } = findLocalFiles(source);

    expect(media).toEqual([
      {
        target: "figures/plot.png",
        references: [{ line: 1, target: "figures/plot.png" }],
        lines: [1, 2],
      },
      {
        target: "logo%20with%20space.svg",
        references: [{ line: 2, target: "logo%20with%20space.svg" }],
        lines: [1, 2],
      },
      {
        target: "./map.png",
        references: [{ line: 4, target: "./map.png" }],
        lines: [4, 6],
      },
      {
        target: "./photo.jpg",
        references: [{ line: 8, target: "./photo.jpg" }],
        lines: [8],
      },
    ]);
  });

  it("finds image and figure directives, and images in captions", () => {
    const source = [
      "```{figure} figures/plot.png",
      ":name: fig-plot",
      "A caption with ![an icon](icon.svg).",
      "```",
      "",
      ":::{image} ../shared/logo.svg",
      ":::",
    ].join("\n");

    expect(targets(source)).toEqual([
      "figures/plot.png",
      "icon.svg",
      "../shared/logo.svg",
    ]);
  });

  it("finds images in the directives the server's extensions add", () => {
    const source = [
      "::::{tab-set}",
      ":::{tab-item} A",
      "![](in-tab.png)",
      ":::",
      "::::",
      "",
      "```{card} Title",
      "![](in-card.png)",
      "```",
      "",
      "::::{grid} 2",
      ":::{grid-item}",
      "![](in-grid.png)",
      ":::",
      "::::",
      "",
      "```{prf:theorem}",
      "![](in-proof.png)",
      "```",
      "",
      "```{exercise}",
      "![](in-exercise.png)",
      "```",
    ].join("\n");

    expect(targets(source)).toEqual([
      "in-tab.png",
      "in-card.png",
      "in-grid.png",
      "in-proof.png",
      "in-exercise.png",
    ]);
  });

  it("groups references to the same file", () => {
    const source = ["![a](plot.png)", "", "![b](plot.png)"].join("\n");

    expect(findLocalFiles(source).media).toEqual([
      {
        target: "plot.png",
        references: [
          { line: 1, target: "plot.png" },
          { line: 3, target: "plot.png" },
        ],
        lines: [1, 3],
      },
    ]);
  });

  it("finds the line of a reference-style image by its label", () => {
    const source = [
      "Some text",
      "then ![a][Map  Ref] and ![b][]",
      "and ![map ref].",
      "",
      "[map ref]: map.png",
      "[b]:",
      "  map.png",
    ].join("\n");

    expect(findLocalFiles(source).media).toEqual([
      {
        target: "map.png",
        references: [
          { line: 2, target: "map.png" },
          { line: 2, target: "map.png" },
          { line: 3, target: "map.png" },
        ],
        lines: [1, 2, 3, 5, 7],
      },
    ]);
  });

  it("finds the line of each image of the same file in a paragraph", () => {
    const source = [
      "![a](plot.png) text",
      "![plot](other.png) and ![b][plot]",
      "and ![c](plot.png)",
      "",
      "[plot]: plot.png",
    ].join("\n");

    expect(
      findLocalFiles(source).media.find(({ target }) => target === "plot.png")
        ?.references
    ).toEqual([
      { line: 1, target: "plot.png" },
      { line: 2, target: "plot.png" },
      { line: 3, target: "plot.png" },
    ]);
  });

  it("finds HTML images, video and audio as a browser parses them", () => {
    const source = [
      '<video controls poster="poster.jpg">',
      '  <source src="clip.mp4" type="video/mp4">',
      "</video>",
      "",
      '<audio src="talk.m4a" controls></audio>',
      "",
      '<img src=unquoted.png alt=x> <img src="a&amp;b.png">',
      "",
      '<template><img src="template.png"></template>',
      '<video src="https://cdn.test/x.mp4"></video>',
      '<picture><source srcset="p.webp"><img src="p.png"></picture>',
    ].join("\n");

    expect(findLocalFiles(source).media.map(({ target }) => target)).toEqual([
      "poster.jpg",
      "clip.mp4",
      "talk.m4a",
      "unquoted.png",
      "a&b.png",
      "p.png",
    ]);
  });

  it("ignores images in HTML comments", () => {
    const source = [
      '<!-- <img src="secret.png"> -->',
      "",
      'Text <!-- <img src="old.png"> --> more',
      "",
      "<div>",
      "<!--",
      '<img src="draft.png">',
      "-->",
      '<img src="a.png">',
      "</div>",
      "",
      "<!-- left open",
      '<img src="unfinished.png">',
    ].join("\n");

    expect(findLocalFiles(source).media.map(({ target }) => target)).toEqual([
      "a.png",
    ]);
  });

  it("reports local includes as unsupported", () => {
    const source = [
      "```{include} other.md",
      "```",
      "",
      "```{literalinclude} code/example.py",
      "```",
      "",
      "```{include} https://example.com/remote.md",
      "```",
    ].join("\n");

    expect(findLocalFiles(source)).toEqual({
      media: [],
      unsupported: [
        { line: 1, target: "other.md" },
        { line: 4, target: "code/example.py" },
      ],
    });
  });

  it("ignores URLs and in-page anchors", () => {
    const source = [
      "![](https://example.com/plot.png)",
      "![](//cdn.example.com/x.png)",
      "![](data:image/png;base64,AAAA)",
      "![](#fig-plot)",
      "```{image} https://example.com/logo.svg",
      "```",
    ].join("\n");

    expect(targets(source)).toEqual([]);
  });

  it("ignores code blocks, code directives and inline code", () => {
    const source = [
      "```markdown",
      "![](in-fence.png)",
      "```",
      "",
      "```{code-block} markdown",
      "![](in-directive.png)",
      "```",
      "",
      "Use `![](inline.png)` to add one.",
    ].join("\n");

    expect(targets(source)).toEqual([]);
  });
});

describe("rewriteMedia", () => {
  function rewrite(source: string, urls: Record<string, string>): string {
    const { media } = findLocalFiles(source);
    return rewriteMedia(source, media, new Map(Object.entries(urls)));
  }

  it("replaces each path with its URL where it's referenced", () => {
    const source = [
      "---",
      "title: plot.png",
      "---",
      "![A plot](plot.png) and ![Ref][map]",
      "",
      "[map]: <./my map.png>",
      "",
      "```{figure} plot.png",
      "plot.png is the caption.",
      "```",
      "",
      '<img src="photo.jpg">',
    ].join("\n");

    expect(
      rewrite(source, {
        "plot.png": "https://s3/plot",
        "./my%20map.png": "https://s3/map",
        "photo.jpg": "https://s3/photo",
      })
    ).toBe(
      [
        "---",
        "title: plot.png",
        "---",
        "![A plot](https://s3/plot) and ![Ref][map]",
        "",
        "[map]: <https://s3/map>",
        "",
        "```{figure} https://s3/plot",
        "plot.png is the caption.",
        "```",
        "",
        '<img src="https://s3/photo">',
      ].join("\n")
    );
  });

  it("finds images on any line of a paragraph", () => {
    const source = ["Some text", "and ![a](a.png)", "", "![b](b.png)"].join(
      "\n"
    );

    expect(
      rewrite(source, { "a.png": "https://s3/a", "b.png": "https://s3/b" })
    ).toBe(
      ["Some text", "and ![a](https://s3/a)", "", "![b](https://s3/b)"].join(
        "\n"
      )
    );
    expect(findLocalFiles(source).media[0]?.references).toEqual([
      { line: 2, target: "a.png" },
    ]);
  });

  it("leaves the path alone in prose and captions", () => {
    const source = [
      "Here ![](a.png)",
      "the file a.png too, see (a.png) or 'a.png'.",
      "",
      ":::{figure} b.png",
      "Caption: made from b.png data",
      ":::",
    ].join("\n");

    expect(
      rewrite(source, { "a.png": "https://s3/a", "b.png": "https://s3/b" })
    ).toBe(
      [
        "Here ![](https://s3/a)",
        "the file a.png too, see (a.png) or 'a.png'.",
        "",
        ":::{figure} https://s3/b",
        "Caption: made from b.png data",
        ":::",
      ].join("\n")
    );
  });

  it("leaves code blocks alone, including definitions in them", () => {
    const source = [
      "![Ref][r]",
      "",
      "[r]: c.png",
      "",
      "```markdown",
      "[r]: c.png",
      "```",
      "",
      "````{tab-set}",
      "```{tab-item} A",
      "![](c.png)",
      "",
      "    ![](c.png)",
      "```",
      "````",
    ].join("\n");

    expect(rewrite(source, { "c.png": "https://s3/c" })).toBe(
      source
        .replace("[r]: c.png", "[r]: https://s3/c")
        .replace("![](c.png)\n", "![](https://s3/c)\n")
    );
  });

  it("leaves inline code and longer paths alone", () => {
    const source = "![a](a.png) `![a](a.png)` ![b](a.png.bak)";

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      "![a](https://s3/a) `![a](a.png)` ![b](a.png.bak)"
    );
  });

  it("leaves inline math and role contents alone", () => {
    const source = [
      String.raw`![](a.png) $\text{![](a.png)}$ {math}` +
        "`\\text{![](a.png)}` {code}`![](a.png)`",
      String.raw`and $$\text{![](a.png)}$$ ![](a.png)`,
      "$$",
      String.raw`\text{![](a.png)}`,
      "$$",
    ].join("\n");

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      source
        .replace("![](a.png) $", "![](https://s3/a) $")
        .replace("$$ ![](a.png)", () => "$$ ![](https://s3/a)")
    );
  });

  it("leaves inline math holding backticks alone", () => {
    const source =
      String.raw`![](a.png) $\text{` +
      "`x`" +
      String.raw`} + \text{![](a.png)}$`;

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      source.replace("![](a.png) $", "![](https://s3/a) $")
    );
  });

  it("leaves math-like text in code spans alone, and masks the math after", () => {
    const source =
      "`$\\text{![](a.png)}$` ![](a.png) " + String.raw`$\text{![](a.png)}$`;

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      source.replace("` ![](a.png) $", "` ![](https://s3/a) $")
    );
  });

  it("replaces src only in HTML tags, and leaves comments alone", () => {
    const source = [
      String.raw`![](a.png) and the attribute src="a.png" in prose`,
      '<!-- was: <img src="a.png"> -->',
      "",
      "<img",
      '  src="a.png">',
    ].join("\n");

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      source
        .replace("![](a.png)", "![](https://s3/a)")
        .replace('  src="a.png">', '  src="https://s3/a">')
    );
  });

  it("replaces unquoted src, poster and video sources", () => {
    const source = [
      "<img src=a.png alt=x>",
      "",
      '<video poster="b.jpg"><source src="c.mp4"></video>',
    ].join("\n");

    expect(
      rewrite(source, {
        "a.png": "https://s3/a",
        "b.jpg": "https://s3/b",
        "c.mp4": "https://s3/c",
      })
    ).toBe(
      [
        "<img src=https://s3/a alt=x>",
        "",
        '<video poster="https://s3/b"><source src="https://s3/c"></video>',
      ].join("\n")
    );
  });

  it("replaces paths written with backslash escapes", () => {
    const source = [
      String.raw`![a](plot\(1\).png) and ![b][p]`,
      "",
      String.raw`[p]: plot\(1\).png`,
    ].join("\n");

    expect(rewrite(source, { "plot(1).png": "https://s3/plot" })).toBe(
      ["![a](https://s3/plot) and ![b][p]", "", "[p]: https://s3/plot"].join(
        "\n"
      )
    );
  });

  it("replaces a definition's destination on the line after its label", () => {
    const source = [
      "![a][p]",
      "",
      "[p]:",
      "  plot.png",
      "",
      "plot.png in prose",
    ].join("\n");

    expect(rewrite(source, { "plot.png": "https://s3/plot" })).toBe(
      source.replace("  plot.png", "  https://s3/plot")
    );
  });

  it("replaces definitions inside blockquotes", () => {
    const source = [
      "> ![a][p] ![b][q]",
      ">",
      "> [p]: a.png",
      "> [q]:",
      ">   b.png",
    ].join("\n");

    expect(
      rewrite(source, { "a.png": "https://s3/a", "b.png": "https://s3/b" })
    ).toBe(
      source
        .replace("[p]: a.png", "[p]: https://s3/a")
        .replace(">   b.png", ">   https://s3/b")
    );
  });

  it("leaves code spans that run over several lines alone", () => {
    const source = [
      "![a](a.png) and `code",
      "![b](a.png)` then ![c](a.png)",
    ].join("\n");

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      [
        "![a](https://s3/a) and `code",
        "![b](a.png)` then ![c](https://s3/a)",
      ].join("\n")
    );
  });

  it("doesn't open a code span at an escaped backtick", () => {
    const source = "\\` then ![a](a.png) and `![b](a.png)` code";

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      "\\` then ![a](https://s3/a) and `![b](a.png)` code"
    );
  });

  it("closes a code span at a backtick after a backslash", () => {
    const source = "`code \\` then ![a](a.png) `![b](a.png)`";

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      "`code \\` then ![a](https://s3/a) `![b](a.png)`"
    );
  });

  it("keeps lines with several targets aligned with their code spans", () => {
    const source = "![a](a.png) ![b](b.png) `![b](b.png)`";

    expect(
      rewrite(source, {
        "a.png": "https://s3/a-long-url",
        "b.png": "https://s3/b",
      })
    ).toBe("![a](https://s3/a-long-url) ![b](https://s3/b) `![b](b.png)`");
  });

  it("replaces directive arguments after a space and uppercase HTML src", () => {
    const source = ["::: {figure} a.png", ":::", "", '<IMG SRC="b.png">'].join(
      "\n"
    );

    expect(
      rewrite(source, { "a.png": "https://s3/a", "b.png": "https://s3/b" })
    ).toBe(
      ["::: {figure} https://s3/a", ":::", "", '<IMG SRC="https://s3/b">'].join(
        "\n"
      )
    );
  });

  it("leaves titles alone", () => {
    const source = [
      `![a](a.png "Example: [label](a.png)") ![b][b] ![c](a.png 'src="a.png"')`,
      `![d](<a.png> "[x](a.png)") ![e](a.png ([x]\\(a.png\\)))`,
      "",
      `[b]: a.png "[x](a.png)"`,
      "[c]: a.png",
      `  '![](a.png)'`,
    ].join("\n");

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      [
        `![a](https://s3/a "Example: [label](a.png)") ![b][b] ![c](https://s3/a 'src="a.png"')`,
        `![d](<https://s3/a> "[x](a.png)") ![e](https://s3/a ([x]\\(a.png\\)))`,
        "",
        `[b]: https://s3/a "[x](a.png)"`,
        "[c]: https://s3/a",
        `  '![](a.png)'`,
      ].join("\n")
    );
  });

  it("leaves other HTML attributes and elements alone", () => {
    const source = [
      `![](a.png) <img alt="![](a.png)" title='src="a.png"' src="a.png">`,
      `<iframe src="a.png"></iframe> <span data-src=a.png></span>`,
    ].join("\n");

    expect(rewrite(source, { "a.png": "https://s3/a" })).toBe(
      source
        .replace("![](a.png) <img", "![](https://s3/a) <img")
        .replace(`src="a.png">`, `src="https://s3/a">`)
    );
  });

  it("ignores HTML elements named like object properties", () => {
    expect(
      rewrite("<constructor src=a.png> ![](a.png)", { "a.png": "u" })
    ).toBe("<constructor src=a.png> ![](u)");
  });

  it("inserts URLs literally", () => {
    expect(rewrite("![a](a.png)", { "a.png": "https://s3/$&" })).toBe(
      "![a](https://s3/$&)"
    );
  });
});

describe("findUnrewritable", () => {
  function unrewritable(source: string) {
    return findUnrewritable(source, findLocalFiles(source).media);
  }

  it("finds nothing when every path can be replaced", () => {
    expect(unrewritable("![a](a.png)\n\n[b]: b.png\n\n![b][b]")).toEqual([]);
  });

  it("finds HTML paths written with character references", () => {
    const source = '<img src="a&amp;b.png">';

    expect(findUnrewritable(source, findLocalFiles(source).media)).toEqual([
      { line: 1, target: "a&b.png" },
    ]);
  });

  it("finds paths written in ways rewriteMedia doesn't recognize", () => {
    expect(unrewritable("![a](\na.png)")).toEqual([
      { line: 1, target: "a.png" },
    ]);
    expect(unrewritable("![b][b]\n\n- [b]: b.png")).toEqual([
      { line: 1, target: "b.png" },
    ]);
    expect(unrewritable("![c](c&amp;d.png)")).toEqual([
      { line: 1, target: "c&d.png" },
    ]);
  });
});

describe("mediaPath", () => {
  it("decodes the target", () => {
    expect(mediaPath("my%20map.png")).toBe("my map.png");
    expect(mediaPath("bad%zz.png")).toBe("bad%zz.png");
  });

  it("decodes reserved characters, which a local path holds literally", () => {
    expect(mediaPath("fig%231%3Fv.png")).toBe("fig#1?v.png");
  });
});
