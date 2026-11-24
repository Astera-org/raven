import {
  formatBibliographyEntry,
  formatCslJson,
} from "#src/lib/bibliography/format-csl-json.js";
import { parseBibliography } from "#src/lib/bibliography/parse-bibliography.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const file = (filename: string, content: string) => ({ filename, content });

const smith = `
@article{smith2020,
  author = {M{\\"u}ller, Anna Maria and Jones, Bob},
  title = {On \\emph{things}},
  year = {2020},
  doi = {10.1234/ABC.def},
}
`;

const jones = `
@book{jones2019,
  author = {Jones, Bob},
  title = {A book},
  year = {2019},
  url = {https://example.com/book},
}
`;

describe("parseBibliography", () => {
  it("has no entries and no issues without a bibliography", () => {
    for (const empty of [null, undefined, { files: [] }]) {
      const { entries, issues } = parseBibliography(empty);
      expect([...entries]).toEqual([]);
      expect(issues).toEqual([]);
    }
  });

  it("reads entries from every file, keyed by citation key", () => {
    const { entries, issues } = parseBibliography({
      files: [file("refs.bib", smith), file("more.bib", jones)],
    });

    expect(issues).toEqual([]);
    expect([...entries.keys()]).toEqual(["smith2020", "jones2019"]);
    expect(entries.get("smith2020")).toMatchObject({
      key: "smith2020",
      filename: "refs.bib",
      referenceUrl: "https://doi.org/10.1234/abc.def",
    });
    expect(entries.get("jones2019")).toMatchObject({
      filename: "more.bib",
      referenceUrl: "https://example.com/book",
    });
  });

  it("turns LaTeX into Unicode and emphasis into HTML", () => {
    const { entries } = parseBibliography({ files: [file("refs.bib", smith)] });
    const { entry } = entries.get("smith2020")!;

    expect(entry.title).toBe("On <i>things</i>");
    expect(entry.author?.[0]?.family).toBe("Müller");
  });

  it("leaves an entry with neither a DOI nor a URL out of references", () => {
    const { entries } = parseBibliography({
      files: [file("refs.bib", "@misc{note2021, title = {A note}}")],
    });

    expect(entries.get("note2021")?.referenceUrl).toBeNull();
  });

  it.each([
    ["ftp://example.com/x", null],
    ["https://Example.com/Book", "https://Example.com/Book"],
  ])("takes %s as the reference URL %s", (url, expected) => {
    const { entries } = parseBibliography({
      files: [file("refs.bib", `@misc{k, title = {T}, url = {${url}}}`)],
    });

    expect(entries.get("k")?.referenceUrl).toBe(expected);
  });

  it("resolves a DOI through doi.org, lowercased, however it is written", () => {
    const { entries } = parseBibliography({
      files: [
        file("a.bib", "@misc{bare, title={T}, doi={10.1234/ABC}}"),
        file(
          "b.bib",
          "@misc{full, title={T}, doi={https://doi.org/10.1234/ABC}}"
        ),
      ],
    });

    expect(entries.get("bare")?.referenceUrl).toBe(
      "https://doi.org/10.1234/abc"
    );
    expect(entries.get("full")?.referenceUrl).toBe(
      "https://doi.org/10.1234/abc"
    );
  });

  // Same identifier as `stacks-citations` gives a direct citation of the DOI,
  // so one work gets one reference number and one `references` row.
  it.each([
    ["doi={http://doi.org/10.1234/ABC}", "an http doi.org URL"],
    ["doi={https://dx.doi.org/10.1234/ABC}", "a dx.doi.org URL"],
    ["doi={http://dx.doi.org/10.1234/ABC}", "an http dx.doi.org URL"],
    ["doi={doi:10.1234/ABC}", "a doi: label"],
    ["url={https://dx.doi.org/10.1234/ABC}", "a doi.org URL field"],
  ])("canonicalizes %s (%s)", (field) => {
    const { entries } = parseBibliography({
      files: [file("refs.bib", `@misc{k, title={T}, ${field}}`)],
    });

    expect(entries.get("k")?.referenceUrl).toBe("https://doi.org/10.1234/abc");
  });

  it("prefers the DOI over the URL", () => {
    const { entries } = parseBibliography({
      files: [
        file(
          "refs.bib",
          "@misc{k, title={T}, doi={10.1234/abc}, url={https://example.com/k}}"
        ),
      ],
    });

    expect(entries.get("k")?.referenceUrl).toBe("https://doi.org/10.1234/abc");
  });

  describe("duplicate keys", () => {
    const duplicate = {
      files: [
        file("refs.bib", smith),
        file("more.bib", "@misc{smith2020, title = {A later definition}}"),
      ],
    };

    it("keeps the last definition", () => {
      const { entries } = parseBibliography(duplicate);

      expect(entries.get("smith2020")).toMatchObject({
        filename: "more.bib",
        entry: { title: "A later definition" },
      });
    });

    it("warns, naming both files", () => {
      const { issues } = parseBibliography(duplicate);

      expect(issues).toEqual([
        {
          code: "custom",
          path: ["files", 1],
          message:
            "more.bib defines smith2020 again, after refs.bib; citations of it use this definition",
        },
      ]);
    });

    it("warns about a key defined twice in one file", () => {
      const { entries, issues } = parseBibliography({
        files: [
          file("refs.bib", "@misc{k, title={First}}\n@misc{k, title={Second}}"),
        ],
      });

      expect(entries.get("k")?.entry.title).toBe("Second");
      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(["files", 0]);
    });
  });

  describe("a file that doesn't parse", () => {
    const broken = {
      files: [
        file("refs.bib", smith),
        file("broken.bib", "@article{oops,\n  title = {Unclosed,\n"),
        file("more.bib", jones),
      ],
    };

    it("contributes no entries, while the other files still do", () => {
      const { entries } = parseBibliography(broken);

      expect([...entries.keys()]).toEqual(["smith2020", "jones2019"]);
    });

    it("is reported at the file, with where the parser stopped", () => {
      const { issues } = parseBibliography(broken);

      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(["files", 1]);
      expect(issues[0]?.message).toMatch(/^broken\.bib couldn't be read: /);
      expect(issues[0]?.message).toMatch(/line \d+ col \d+/);
      expect(issues[0]?.message).not.toContain("\n");
    });
  });

  describe("content that isn't BibTeX", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each(["https://example.com/refs.bib", "10.1234/abc", "", "% a comment"])(
      "reads no entries from %s, and fetches nothing",
      (content) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        const { entries, issues } = parseBibliography({
          files: [file("refs.bib", content)],
        });

        expect([...entries]).toEqual([]);
        expect(issues).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
      }
    );
  });
});

describe("formatCslJson", () => {
  it("reads like a DOI reference: authors, year, title", () => {
    const { entries } = parseBibliography({ files: [file("refs.bib", smith)] });

    expect(formatCslJson(entries.get("smith2020")!.entry)).toBe(
      "Müller AM, Jones B. (2020). On things."
    );
  });

  it.each([
    ["<i>Nature</i> at work", "Nature at work."],
    ['<span style="font-variant:small-caps;">DNA</span> repair', "DNA repair."],
    ["A <sub>2</sub>nd look", "A 2nd look."],
    ["p < 0.05 and q > 0.1", "p < 0.05 and q > 0.1."],
  ])("strips the tags from %s", (title, expected) => {
    expect(formatCslJson({ title })).toBe(`(n.d.). ${expected}`);
  });

  it("falls back to Untitled", () => {
    expect(formatCslJson({ title: "<i></i>" })).toBe("(n.d.). Untitled.");
    expect(formatCslJson({})).toBe("(n.d.). Untitled.");
  });
});

describe("formatBibliographyEntry", () => {
  const formatted = (bibtex: string) => {
    const { entries } = parseBibliography({
      files: [file("refs.bib", bibtex)],
    });
    return formatBibliographyEntry([...entries.values()][0]!.entry);
  };

  it.each([
    [
      "an article: journal, volume(issue), pages",
      "@article{a, author={Doe, Jane}, title={Fibres}, journal={\\emph{J. Things}}, volume={12}, number={3}, pages={45--67}, year={2020}}",
      "Doe J. (2020). Fibres. J. Things, 12(3), 45–67.",
    ],
    [
      "a book: edition, place and publisher",
      "@book{b, author={Mitchell, Melanie}, title={Complexity: A guided tour}, edition={2}, publisher={Oxford University Press}, address={New York}, year={2009}}",
      "Mitchell M. (2009). Complexity: A guided tour. 2nd ed. New York: Oxford University Press.",
    ],
    [
      "a chapter: the edited book and its pages",
      "@incollection{c, author={Roe, Rita}, title={A chapter}, booktitle={Big Book}, editor={Ed, Eve and Other, Otto}, pages={1--10}, publisher={Pub}, year={2001}}",
      "Roe R. (2001). A chapter. In Ed E, Other O (Eds.), Big Book (pp. 1–10). Pub.",
    ],
    [
      "a conference paper",
      "@inproceedings{d, author={Roe, Rita}, title={A talk}, booktitle={Proc. Conf.}, pages={5--9}, year={2003}}",
      "Roe R. (2003). A talk. In Proc. Conf. (pp. 5–9).",
    ],
    [
      "a thesis",
      "@phdthesis{e, author={Roe, Rita}, title={A thesis}, school={MIT}, year={2010}}",
      "Roe R. (2010). A thesis. PhD thesis. MIT.",
    ],
    [
      "a report",
      "@techreport{f, author={Roe, Rita}, title={A report}, institution={Lab}, number={TR-1}, year={2011}}",
      "Roe R. (2011). A report. No. TR-1. Lab.",
    ],
    [
      "an edited book, by its editor",
      "@book{h, editor={Ed, Eve}, title={Edited}, publisher={P}, year={2000}}",
      "Ed E (Ed.). (2000). Edited. P.",
    ],
  ])("formats %s", (_, bibtex, expected) => {
    expect(formatted(bibtex)).toBe(expected);
  });

  it("is formatCslJson's text when there are no details", () => {
    expect(formatted(smith)).toBe("Müller AM, Jones B. (2020). On things.");
  });
});
