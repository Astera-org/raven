import { buildPublicationMdast } from "#src/lib/myst/build-publication-mdast.js";
import {
  MDAST_SCHEMA_VERSION,
  MYST_AST_VERSION,
} from "#src/lib/myst/versions.js";
import { describe, expect, it } from "vitest";

interface Node {
  type: string;
  children?: Node[];
  [key: string]: unknown;
}

function nodes(tree: Node, type?: string): Node[] {
  const found: Node[] = [];
  const visit = (node: Node) => {
    if (!type || node.type === type) found.push(node);
    node.children?.forEach(visit);
  };
  visit(tree);
  return found;
}

function only(tree: Node, type: string): Node {
  const found = nodes(tree, type);
  expect(found).toHaveLength(1);
  return found[0]!;
}

const ABSTRACT = "Corvids cite [](https://doi.org/10.1038/Nature12373).";

const BODY = [
  "## Methods",
  "",
  ":::{note}",
  "A note.",
  ":::",
  "",
  ":::{tip}",
  ":class: dropdown",
  "Hidden.",
  ":::",
  "",
  "```{figure} https://example.org/setup.png",
  ":label: fig-setup",
  "The setup.",
  "```",
  "",
  "$$ E=mc^2 $$ (eq-energy)",
  "",
  "Inline $\\alpha$, {numref}`fig-setup` and {eq}`eq-energy`.[^1]",
  "",
  "Again {cite}`10.1038/nature12373`, then {cite:t}`doi:10.1234/ABC`",
  "and [](https://example.org/report); [](doi:10.5555/xyz).",
  "",
  "[^1]: A footnote.",
  "",
  "::::{tab-set}",
  ":::{tab-item} One",
  "First.",
  ":::",
  ":::{tab-item} Two",
  "Second.",
  ":::",
  "::::",
  "",
  "```{code} python",
  ":caption: A snippet",
  "print('hi')",
  "```",
].join("\n");

function build(abstract = ABSTRACT, body = BODY) {
  return buildPublicationMdast({ abstract, body });
}

describe("buildPublicationMdast", () => {
  it("wraps the abstract and body in part blocks with the current versions", () => {
    const payload = build();

    expect(payload.schema).toBe(MDAST_SCHEMA_VERSION);
    expect(payload.version).toBe(MYST_AST_VERSION);
    expect(payload.tree.type).toBe("root");
    expect(payload.tree.children.map((c) => [c.type, c.data?.part])).toEqual([
      ["block", "abstract"],
      ["block", "body"],
    ]);
    expect(payload.tree.children[1]!.children![0]).toMatchObject({
      type: "heading",
      depth: 2,
    });
  });

  it("lifts directives and roles, including admonitions", () => {
    const { tree } = build();

    expect(nodes(tree, "mystDirective")).toEqual([]);
    expect(nodes(tree, "mystRole")).toEqual([]);
    expect(nodes(tree, "admonition").map((n) => n.kind)).toEqual([
      "note",
      "tip",
    ]);
  });

  it("numbers the figure and equation and resolves references to them", () => {
    const { tree } = build();

    expect(
      nodes(tree, "container").find((n) => n.kind === "figure")
    ).toMatchObject({
      enumerator: "1",
      html_id: "fig-setup",
    });
    expect(only(tree, "math")).toMatchObject({
      value: "E=mc^2",
      enumerator: "1",
    });
    expect(
      nodes(tree, "crossReference").map((n) => [n.identifier, n.resolved])
    ).toEqual([
      ["fig-setup", true],
      ["eq-energy", true],
    ]);
  });

  it("keeps math unrendered", () => {
    const { tree } = build();

    expect(only(tree, "inlineMath")).toEqual({
      type: "inlineMath",
      value: "\\alpha",
      key: expect.any(String),
    });
  });

  it("numbers footnotes and keeps tabs and code captions", () => {
    const { tree } = build();

    expect(only(tree, "footnoteReference").enumerator).toBe("1");
    expect(only(tree, "footnoteDefinition").enumerator).toBe("1");
    expect(only(tree, "tabSet").children).toHaveLength(2);
    expect(nodes(tree, "tabItem")).toHaveLength(2);
    const code = nodes(tree, "container").find((n) => n.kind === "code")!;
    expect(only(code, "code").value).toBe("print('hi')");
    expect(JSON.stringify(only(code, "caption"))).toContain("A snippet");
  });

  it("collapses DOI citations to one lowercased URL, numbered abstract first", () => {
    const { tree, citations } = build();

    expect(citations.order).toEqual([
      "https://doi.org/10.1038/nature12373",
      "https://doi.org/10.1234/abc",
      "https://example.org/report",
      "https://doi.org/10.5555/xyz",
    ]);
    const cites = nodes(tree, "cite");
    expect(cites.map((c) => [c.label, c.identifier, c.enumerator])).toEqual([
      [
        "https://doi.org/10.1038/nature12373",
        "https://doi.org/10.1038/nature12373",
        "1",
      ],
      [
        "https://doi.org/10.1038/nature12373",
        "https://doi.org/10.1038/nature12373",
        "1",
      ],
      ["https://doi.org/10.1234/abc", "https://doi.org/10.1234/abc", "2"],
      ["https://example.org/report", "https://example.org/report", "3"],
      ["https://doi.org/10.5555/xyz", "https://doi.org/10.5555/xyz", "4"],
    ]);
    expect(cites.every((c) => c.kind === "parenthetical")).toBe(true);
  });

  it("groups citations separated only by whitespace or a comma", () => {
    const { tree } = build(
      "",
      "See [](https://a.org) [](https://b.org), {cite}`10.1234/c` and [](https://d.org)."
    );

    const groups = nodes(tree, "citeGroup");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.children!.map((c) => c.label)).toEqual([
      "https://a.org",
      "https://b.org",
      "https://doi.org/10.1234/c",
    ]);
    expect(nodes(tree, "cite").at(-1)!.label).toBe("https://d.org");
  });

  it("leaves links with text alone", () => {
    const { tree, citations } = build("", "A [report](https://example.org).");

    expect(only(tree, "link").url).toBe("https://example.org");
    expect(citations.order).toEqual([]);
  });

  it("warns about citations it cannot resolve, with their part and paragraph line", () => {
    const { tree, messages, citations } = build(
      "Line one.\n\nCites {cite}`smith2020`.",
      "Body.\n\nAlso {cite}`jones2021`."
    );

    expect(citations.order).toEqual([]);
    expect(nodes(tree, "cite").every((c) => c.error === true)).toBe(true);
    expect(messages).toEqual([
      {
        severity: "warning",
        message: 'Could not link citation with label "smith2020".',
        part: "abstract",
        line: 3,
      },
      {
        severity: "warning",
        message: 'Could not link citation with label "jones2021".',
        part: "body",
        line: 3,
      },
    ]);
  });

  it("turns a citation naming a target into a cross-reference", () => {
    const { tree, messages } = build(
      "",
      "```{figure} https://example.org/a.png\n:label: fig-a\nA.\n```\n\nSee {cite}`fig-a`."
    );

    expect(nodes(tree, "cite")).toEqual([]);
    expect(only(tree, "crossReference").identifier).toBe("fig-a");
    expect(messages).toEqual([]);
  });

  it("reports unknown and unsupported directives", () => {
    const { messages } = build(
      "",
      "{foo}`bar`\n\n```{include} other.md\n```\n"
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "unknown role: foo", line: 1 }),
        expect.objectContaining({
          message: "{include} and {literalinclude} are not supported yet",
          part: "body",
          line: 3,
        }),
      ])
    );
  });

  it("parses the parts separately, so an unclosed fence in the abstract stays there", () => {
    const { tree } = build("```\nunclosed", "## Body heading");

    expect(only(tree, "heading").children![0]!.value).toBe("Body heading");
  });

  it("reserves the purpose id for thestacks.org's Purpose heading", () => {
    const { tree } = build("", "## Purpose\n\n## Purpose-1");

    expect(nodes(tree, "heading").map((h) => h.html_id)).toEqual([
      "purpose-2",
      "purpose-1",
    ]);
  });

  it("points cross-references to a renamed purpose heading at its new id", () => {
    const { tree } = build("", "(purpose)=\n## Purpose\n\nSee [](#purpose).");

    expect(only(tree, "heading").html_id).toBe("purpose-1");
    expect(only(tree, "crossReference").html_id).toBe("purpose-1");
  });

  it("keeps citations it could not resolve out of groups", () => {
    const { tree } = build(
      "",
      "```{figure} https://example.org/a.png\n:label: fig-a\nA.\n```\n\nSee {cite}`fig-a` [](https://doi.org/10.1234/x)."
    );

    expect(nodes(tree, "citeGroup")).toEqual([]);
    expect(only(tree, "crossReference").identifier).toBe("fig-a");
    expect(only(tree, "cite").label).toBe("https://doi.org/10.1234/x");
  });

  it("warns once per line about raw HTML, but not about comments", () => {
    const { messages } = build(
      "",
      'Some <b>bold</b> text.\n\n<!-- a comment -->\n\n<iframe src="https://example.org"></iframe>'
    );

    expect(messages).toEqual([
      {
        severity: "warning",
        message:
          "Raw HTML is not rendered on thestacks.org yet and will be left out",
        part: "body",
        line: 1,
      },
      {
        severity: "warning",
        message:
          "Raw HTML is not rendered on thestacks.org yet and will be left out",
        part: "body",
        line: 5,
      },
    ]);
  });

  it("drops positions, gives every node a key, and is deterministic", () => {
    const first = build();
    const second = build();

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const all = nodes(first.tree);
    expect(all.some((n) => "position" in n)).toBe(false);
    const keys = all.map((n) => n.key);
    expect(keys.every((k) => typeof k === "string")).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("handles a missing abstract and body", () => {
    const payload = buildPublicationMdast({ abstract: null, body: undefined });

    expect(payload.tree.children.map((c) => c.children)).toEqual([[], []]);
    expect(payload.citations.order).toEqual([]);
    expect(payload.messages).toEqual([]);
  });
});

const BIBLIOGRAPHY = {
  files: [
    {
      filename: "refs.bib",
      content: [
        "@article{smith2020,",
        '  author = {M{\\"u}ller, Anna Maria and Jones, Bob},',
        "  title = {On \\emph{things}},",
        "  year = {2020},",
        "  doi = {10.1234/ABC},",
        "}",
        "@book{jones2019,",
        "  author = {Jones, Bob},",
        "  title = {A book},",
        "  year = {2019},",
        "}",
        "@misc{linked2021,",
        "  title = {A page},",
        "  url = {https://example.org/page},",
        "}",
      ].join("\n"),
    },
  ],
};

function buildWithBibliography(body: string, abstract = "") {
  return buildPublicationMdast({ abstract, body, bibliography: BIBLIOGRAPHY });
}

describe("buildPublicationMdast with a bibliography", () => {
  it("numbers a cited key and carries its text and key", () => {
    const { tree, citations, citedKeys, messages } = buildWithBibliography(
      "They remember faces {cite}`smith2020`."
    );

    expect(only(tree, "cite")).toMatchObject({
      label: "https://doi.org/10.1234/abc",
      identifier: "https://doi.org/10.1234/abc",
      enumerator: "1",
      kind: "parenthetical",
      citationKey: "smith2020",
      citationText: "Müller AM, Jones B. (2020). On things.",
    });
    expect(citations.order).toEqual(["https://doi.org/10.1234/abc"]);
    expect(citedKeys).toEqual(["smith2020"]);
    expect(messages).toEqual([]);
  });

  it.each([
    ["@jones2019 said so", "@key"],
    ["Both [@jones2019] agree", "[@key]"],
    ["Narrative {cite:t}`jones2019`", "{cite:t}"],
  ])("resolves %s, written as %s", (body) => {
    const { tree, citedKeys } = buildWithBibliography(body);

    expect(only(tree, "cite")).toMatchObject({
      label: "jones2019",
      identifier: "jones2019",
      enumerator: "1",
      citationText: "Jones B. (2019). A book.",
    });
    expect(citedKeys).toEqual(["jones2019"]);
  });

  it("identifies an entry with a URL by it, and one with neither by its key", () => {
    const { citations, citedKeys } = buildWithBibliography(
      "See {cite}`linked2021` and {cite}`jones2019`."
    );

    expect(citations.order).toEqual(["https://example.org/page", "jones2019"]);
    expect(citedKeys).toEqual(["linked2021", "jones2019"]);
  });

  it("gives a work cited by key and by DOI one number", () => {
    const { tree, citations, citedKeys } = buildWithBibliography(
      "First [](https://doi.org/10.1234/abc), then {cite}`smith2020`."
    );

    expect(citations.order).toEqual(["https://doi.org/10.1234/abc"]);
    expect(nodes(tree, "cite").map((c) => c.enumerator)).toEqual(["1", "1"]);
    // The bibliography's own text is on the node that cited it by key.
    expect(nodes(tree, "cite").map((c) => c.citationText)).toEqual([
      undefined,
      "Müller AM, Jones B. (2020). On things.",
    ]);
    expect(citedKeys).toEqual(["smith2020"]);
  });

  it("gives two keys for the same work one number, and counts both as cited", () => {
    const { tree, citations, citedKeys } = buildPublicationMdast({
      abstract: "",
      body: "See {cite}`first` and later {cite}`second`.",
      bibliography: {
        files: [
          {
            filename: "refs.bib",
            content: [
              "@article{first, title = {On things}, doi = {10.1234/abc}}",
              "@article{second, title = {Things, again}, doi = {10.1234/ABC}}",
            ].join("\n"),
          },
        ],
      },
    });

    expect(citations.order).toEqual(["https://doi.org/10.1234/abc"]);
    expect(nodes(tree, "cite").map((c) => c.enumerator)).toEqual(["1", "1"]);
    expect(citedKeys).toEqual(["first", "second"]);
  });

  it("groups a key with the citations next to it", () => {
    const { tree } = buildWithBibliography(
      "See {cite}`smith2020`, [](https://b.org)."
    );

    expect(only(tree, "citeGroup").children!.map((c) => c.label)).toEqual([
      "https://doi.org/10.1234/abc",
      "https://b.org",
    ]);
  });

  it("leaves uncited entries out, and still warns about an unknown key", () => {
    const { tree, citations, citedKeys, messages } = buildWithBibliography(
      "Cites {cite}`nobody2024`."
    );

    expect(only(tree, "cite")).toMatchObject({ error: true });
    expect(citations.order).toEqual([]);
    expect(citedKeys).toEqual([]);
    expect(messages).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: 'Could not link citation with label "nobody2024".',
      }),
    ]);
  });

  it("warns about every key when the bibliography is missing", () => {
    const { tree, messages } = buildPublicationMdast({
      abstract: "",
      body: "Cites {cite}`smith2020`.",
    });

    expect(only(tree, "cite")).toMatchObject({ error: true });
    expect(messages).toHaveLength(1);
  });

  it("ignores a file that doesn't parse, without a message of its own", () => {
    const { tree, messages } = buildPublicationMdast({
      abstract: "",
      body: "Cites {cite}`smith2020`.",
      bibliography: {
        files: [{ filename: "refs.bib", content: "@article{smith2020,\n" }],
      },
    });

    expect(only(tree, "cite")).toMatchObject({ error: true });
    expect(messages).toEqual([
      expect.objectContaining({
        message: 'Could not link citation with label "smith2020".',
      }),
    ]);
  });
});

describe("buildPublicationMdast with frontmatter", () => {
  const body = [
    "# Introduction",
    "",
    "(sec-methods)=",
    "## Methods",
    "",
    "See §[%s](#sec-methods).",
  ].join("\n");

  function referenceText(numbering?: Record<string, unknown>) {
    const { tree } = buildPublicationMdast({
      abstract: "",
      body,
      frontmatter: numbering ? { numbering } : null,
    });
    return nodes(only(tree, "crossReference"), "text")
      .map((n) => n.value)
      .join("");
  }

  it("fills a heading reference's %s with ?? when headings aren't numbered", () => {
    expect(referenceText()).toBe("??");
  });

  it("numbers headings when the frontmatter turns numbering on, from ## as mystmd does", () => {
    expect(
      referenceText({
        heading_1: { enabled: true },
        heading_2: { enabled: true },
      })
    ).toBe("1");
  });

  it("carries the math macros for the client, and leaves them out when there are none", () => {
    const math = { "\\R": { macro: "\\mathbb{R}" } };

    expect(
      buildPublicationMdast({
        abstract: "",
        body: "$x \\in \\R$",
        frontmatter: { math },
      }).frontmatter
    ).toEqual({ math });
    expect(
      buildPublicationMdast({ abstract: "", body: "$x$" }).frontmatter
    ).toBeUndefined();
  });
});
