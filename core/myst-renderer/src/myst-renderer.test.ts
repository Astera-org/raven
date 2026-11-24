import { fromHtml } from "hast-util-from-html";
import { visit } from "unist-util-visit";
import { describe, expect, it } from "vitest";
import {
  mystToHtml,
  normalizeEmphasisUnderscores,
  rehypeFigureActionButtons,
  rehypeTableEdgeCells,
} from "./myst-renderer.js";

describe("rehypeFigureActionButtons", () => {
  const figureTree = (mediaStyle?: string) => ({
    type: "root",
    children: [
      {
        type: "element",
        tagName: "figure",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "video",
            properties: mediaStyle ? { style: mediaStyle } : {},
            children: [],
          },
          {
            type: "element",
            tagName: "figcaption",
            properties: {},
            children: [{ type: "text", value: "caption" }],
          },
        ],
      },
    ],
  });

  const wrapperOf = (tree: any) => tree.children[0].children[0].properties;

  it("marks media given an explicit width with data-sized so the caption can track it", () => {
    const tree = figureTree(
      "width:min(calc(0.6 * var(--figure-max-w)), 100cqi)"
    );
    rehypeFigureActionButtons()(tree);
    const props = wrapperOf(tree);

    expect(props.className).toContain("figure-action-target");
    expect(props["data-media-type"]).toBe("video");
    expect(props["data-sized"]).toBe("true");
  });

  it("leaves full-width media (no explicit width) without data-sized", () => {
    const tree = figureTree();
    rehypeFigureActionButtons()(tree);
    const props = wrapperOf(tree);

    expect(props["data-media-type"]).toBe("video");
    expect(props["data-sized"]).toBeUndefined();
  });

  it("leaves width:100% media (e.g. iframes) without data-sized so it stays full-width", () => {
    const tree = figureTree("width:100%;aspect-ratio:16/9");
    rehypeFigureActionButtons()(tree);
    const props = wrapperOf(tree);

    expect(props["data-sized"]).toBeUndefined();
  });
});

describe("rehypeTableEdgeCells", () => {
  const edgesOf = (html: string) => {
    const tree = fromHtml(html, { fragment: true });
    rehypeTableEdgeCells()(tree);

    const edges = new Map<string, string[]>();
    visit(tree, "element", (node: any) => {
      if (node.tagName !== "td" && node.tagName !== "th") return;
      const text = (node.children || [])
        .map((c: any) => (c.type === "text" ? c.value : ""))
        .join("")
        .trim();
      edges.set(
        text,
        ((node.properties?.className || []) as string[]).filter((c) =>
          c.startsWith("table-edge-")
        )
      );
    });
    return edges;
  };

  it("opens the outer edges of a plain grid", () => {
    const edges = edgesOf(
      `<table><thead><tr><th>h1</th><th>h2</th></tr></thead>
       <tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>`
    );

    expect(edges.get("h1")).toEqual(["table-edge-top", "table-edge-left"]);
    expect(edges.get("h2")).toEqual(["table-edge-top", "table-edge-right"]);
    expect(edges.get("a")).toEqual(["table-edge-left"]);
    expect(edges.get("c")).toEqual(["table-edge-bottom", "table-edge-left"]);
    expect(edges.get("d")).toEqual(["table-edge-bottom", "table-edge-right"]);
  });

  it("marks a cell that spans into the bottom row, though it sits in an earlier row", () => {
    const edges = edgesOf(
      `<table><tbody>
        <tr><td rowspan="2">span</td><td>a</td></tr>
        <tr><td>b</td></tr>
      </tbody></table>`
    );

    expect(edges.get("span")).toContain("table-edge-bottom");
    expect(edges.get("b")).toContain("table-edge-bottom");
    expect(edges.get("b")).not.toContain("table-edge-left");
  });

  it("marks a cell that spans into the last column", () => {
    const edges = edgesOf(
      `<table><tbody>
        <tr><td>a</td><td colspan="2">wide</td></tr>
        <tr><td>b</td><td>c</td><td>d</td></tr>
      </tbody></table>`
    );

    expect(edges.get("wide")).toEqual(["table-edge-top", "table-edge-right"]);
    expect(edges.get("c")).toEqual(["table-edge-bottom"]);
  });

  it("leaves a short row's last cell with its right border", () => {
    const edges = edgesOf(
      `<table><tbody>
        <tr><td>a</td><td>b</td><td>c</td></tr>
        <tr><td>d</td><td>e</td></tr>
      </tbody></table>`
    );

    expect(edges.get("e")).toEqual(["table-edge-bottom"]);
  });

  it("keeps a row group's spans out of the next group", () => {
    const edges = edgesOf(
      `<table>
        <thead><tr><th rowspan="3">h</th><th>h2</th></tr></thead>
        <tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody>
      </table>`
    );

    expect(edges.get("h")).not.toContain("table-edge-bottom");
    expect(edges.get("a")).toContain("table-edge-left");
    expect(edges.get("c")).toEqual(["table-edge-bottom", "table-edge-left"]);
  });

  it("treats rowspan=0 as running to the end of the row group", () => {
    const edges = edgesOf(
      `<table><tbody>
        <tr><td rowspan="0">tall</td><td>a</td></tr>
        <tr><td>b</td></tr>
      </tbody></table>`
    );

    expect(edges.get("tall")).toContain("table-edge-bottom");
    expect(edges.get("b")).not.toContain("table-edge-left");
  });

  it("clamps oversized spans instead of walking a giant grid", () => {
    const edges = edgesOf(
      `<table><tbody>
        <tr><td rowspan="99999" colspan="99999">huge</td><td>a</td></tr>
        <tr><td>b</td></tr>
      </tbody></table>`
    );

    expect(edges.get("huge")).toEqual([
      "table-edge-top",
      "table-edge-bottom",
      "table-edge-left",
    ]);
  });

  it("puts a tfoot written before the tbody on the bottom edge", () => {
    const edges = edgesOf(
      `<table>
        <tfoot><tr><td>foot</td></tr></tfoot>
        <tbody><tr><td>body</td></tr></tbody>
      </table>`
    );

    expect(edges.get("foot")).toContain("table-edge-bottom");
    expect(edges.get("foot")).not.toContain("table-edge-top");
    expect(edges.get("body")).toContain("table-edge-top");
    expect(edges.get("body")).not.toContain("table-edge-bottom");
  });

  it("keeps nested table edges separate from the outer table", () => {
    const edges = edgesOf(
      `<table><tbody>
        <tr><td>outer<table><tbody><tr><td>inner</td></tr></tbody></table></td></tr>
      </tbody></table>`
    );

    expect(edges.get("inner")).toEqual([
      "table-edge-top",
      "table-edge-bottom",
      "table-edge-left",
      "table-edge-right",
    ]);
  });
});

describe("normalizeEmphasisUnderscores", () => {
  it("switches to asterisks when a non-ASCII letter follows the span", () => {
    expect(normalizeEmphasisUnderscores("_dea2_\u0394 value")).toBe(
      "*dea2*\u0394 value"
    );
  });

  // Sentences from a Google Doc import where a match used to start at the
  // closing `_` of `_n_` and run across paragraphs to the `_` before `η`.
  it("does not start a match at the closing underscore of a span", () => {
    const myst =
      "Nulls were pooled by retained subspace signature (_n_, dimension), " +
      "with 60 null draws per signature.\n\n" +
      "We computed trait-wise clade _\u03b7_<sup>2</sup> for each phenotype " +
      "layer. For each trait, _\u03b7_<sup>2</sup> was the fraction.";
    expect(normalizeEmphasisUnderscores(myst)).toBe(myst);
  });

  it("does not match across lines", () => {
    const myst = "Signature (_n_, dimension)\n_\u03b7_ and _x_\u0394";
    expect(normalizeEmphasisUnderscores(myst)).toBe(
      "Signature (_n_, dimension)\n_\u03b7_ and *x*\u0394"
    );
  });

  it.each([
    ["a non-breaking space", "_S. cerevisiae_\u00a0isolates"],
    ["an em dash", "_K_\u2014the number of clades"],
    ["an ASCII letter", "_foo_bar"],
    ["a word before the opening underscore", "snake_case_\u0394"],
  ])("leaves the span alone before %s", (_, myst) => {
    expect(normalizeEmphasisUnderscores(myst)).toBe(myst);
  });
});

describe("mystToHtml", () => {
  it("keeps italics intact around later Greek-letter italics", () => {
    const html = mystToHtml({
      myst:
        "Pooled by signature (_n_, dimension).\n\n" +
        "Clade _\u03b7_<sup>2</sup> per layer; for each trait, _\u03b7_<sup>2</sup> was used.",
    });

    expect(html).toContain("(<em>n</em>, dimension)");
    expect(html.match(/<em>\u03b7<\/em><sup>2<\/sup>/g)).toHaveLength(2);
    expect(html).not.toMatch(/[_*]n[_*]|\*\u03b7|\u03b7_/);
  });

  describe("remarkDemathifyAccidents", () => {
    it.each(["$X$", "$\\mathrm H$"])("renders inline math: %s", (math) => {
      const html = mystToHtml({ myst: math });

      // Surrounding text is preserved before/after the math span.
      expect(html).toContain('<span class="katex">');
    });

    it("demathifies if there's trailing space between $...$", () => {
      const html = mystToHtml({ myst: "$20-40k vs. $200k" });

      // Output should not contain KaTeX-rendered math.
      expect(html).not.toMatch(/class="[^"]*\bkatex\b/);

      // Output should contain the literal dollar signs.
      expect(html).toContain("$20-40k vs. $200k");
    });
  });

  describe("rehypeStripIframeSrcDoc", () => {
    it("strips srcdoc from a raw-HTML iframe so it can't inject a script", () => {
      const html = mystToHtml({
        myst: '<iframe src="https://example.com" srcdoc="<script>alert(1)</script>"></iframe>',
      });

      expect(html).not.toContain("srcdoc");
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain('src="https://example.com"');
    });

    it("doesn't affect directive-authored iframes, which never set srcdoc", () => {
      const html = mystToHtml({
        myst: ':::iframe{src="https://example.com"}\n:::',
      });

      expect(html).toContain('src="https://example.com"');
      expect(html).not.toContain("srcdoc");
    });
  });

  describe("rehypeFileDownload", () => {
    const fileMyst =
      ':::file{filename="tardi-data.gz" src="/uploads/tardi-data.gz"}\n:::';

    it("renders a working download button, not a reference badge", () => {
      const html = mystToHtml({ myst: fileMyst });

      // The download anchor must survive with its download attributes intact.
      expect(html).toContain(
        '<a href="/uploads/tardi-data.gz" download="tardi-data.gz"'
      );
      expect(html).toContain('class="file-download-btn"');

      // The icon-only download link must NOT be rewritten into a numbered
      // reference badge by rehypeReferenceLinks.
      expect(html).not.toContain("ref-link-wrapper");
      expect(html).not.toContain("ref-link-anchor");
    });
  });

  describe("applySizingAttrs", () => {
    it("emits width:100% for full-width images (not a figure-max-w calc)", () => {
      const html = mystToHtml({
        myst: ":::image{src=/img.png width=100%}\n:::",
      });

      expect(html).toContain('style="width:100%"');
      expect(html).not.toContain("--figure-max-w");
    });

    it("emits a figure-max-w calc for partial percentage widths", () => {
      const html = mystToHtml({
        myst: ":::image{src=/img.png width=60%}\n:::",
      });

      expect(html).toContain(
        'style="width:min(calc(0.6 * var(--figure-max-w)), 100cqi)"'
      );
    });
  });

  describe("rehypeTableRowGroups", () => {
    it("drops empty row groups and merges split bodies", () => {
      // The HTML parser repairs GDocs' misplaced <tbody> tag into an empty
      // row group, which breaks Firefox's collapsed table borders.
      const html = mystToHtml({
        myst: `:::figure{type=table}
<table><thead><tr><td>H</td></tr></thead><tbody></tbody><tbody><tr><td>A</td></tr></tbody><tbody><tr><td>B</td></tr></tbody></table>
:::`,
      });

      expect(html).not.toContain("<tbody></tbody>");
      expect((html.match(/<tbody>/g) || []).length).toBe(1);
      // Match on structure, not markup: other table plugins decorate cells.
      const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
      expect((tbody.match(/<tr\b/g) || []).length).toBe(2);
      expect(tbody).toMatch(/>A<[\s\S]*>B</);
    });
  });

  describe("rehypeMergeAdjacentLinks", () => {
    it("merges adjacent same-href links (split around an italic) into one anchor", () => {
      // prosemirror-markdown serializes a link wrapping an italic as several
      // adjacent same-url links; they must render as a single continuous link.
      const html = mystToHtml({
        myst: "[Rescuing ](https://x.com/a)[*Chlamydomonas*](https://x.com/a)[ motility](https://x.com/a)",
      });

      expect((html.match(/<a /g) || []).length).toBe(1);
      expect(html).toContain("Rescuing <em>Chlamydomonas</em> motility");
    });

    it("keeps links to different hrefs separate", () => {
      const html = mystToHtml({
        myst: "[one](https://x.com/a) [two](https://x.com/b)",
      });

      expect((html.match(/<a /g) || []).length).toBe(2);
    });
  });
});
