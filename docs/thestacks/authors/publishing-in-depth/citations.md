---
description: Cite papers and software in your publication.
---

# Citations

The Stacks numbers your citations and builds a reference list at the end of the publication, ordered by first appearance.

The rest of this page is about citing in a Google Doc. In MyST, cite with DOI links or with the keys of your own BibTeX files: see [](#authors:cite-myst).

(authors:cite-doi)=

## Cite a paper with a DOI

1. Type `:ref` where the citation goes.
2. Select exactly those four characters, with no surrounding spaces.
3. Press ⌘+K (Ctrl+K on Windows) and paste the DOI as a URL, like `https://doi.org/10.1038/nature07670`.

For several citations in a row, separate each `:ref` link with a single space.

:::{warning}
Only `:ref` links become citations.
A bare DOI string (`10.1038/...`) or a visible link to a journal, PubMed, or bioRxiv page renders as an ordinary link and will not appear in the reference list. The Google Doc "citation" feature is also **not** supported.
:::

(authors:cite-no-doi)=

## Cite software and other sources without a DOI

1. Add a `:ref` link pointing at the source's URL, like a GitHub repository.
2. At the end of the doc, after the acknowledgments, add a `:::bibtex` block with a `@Misc` entry whose `url` exactly matches that link.

```text
:::bibtex
@Misc{ arcadia-microscopy-tools,
  title = {arcadia-microscopy-tools},
  author = {Arcadia Science},
  year = {2026},
  url = {https://github.com/Arcadia-Science/arcadia-microscopy-tools}
}
:::
```

You can put several entries in one block, each starting with `@` on its own line.
Don't add BibTeX for sources that have a DOI: The Stacks looks those up automatically.

(authors:cite-myst)=

## Cite in a MyST publication

Write citations as MyST does:

- A DOI, as ``{cite}`10.1038/nature07670` `` or a link with no text, `[](https://doi.org/10.1038/nature07670)`.
- A key of your own BibTeX files, as ``{cite}`smith2020` ``, `@smith2020`, or several at once, `[@smith2020; @jones2019]`.

The `raven` command line tool sends those files with your document: the ones `myst.yml`'s `bibliography` names, or every `.bib` file in the project when it names none, plus the files your page's frontmatter names.
A single `.md` file has no project, so name its files in its own frontmatter:

```yaml
---
title: Ravens remember faces
bibliography: [refs.bib]
---
```

Only the entries you cite become references, and only those are published; the rest of a `.bib` file stays between you and the draft.
An entry with a DOI is looked up like any other DOI citation, so a work you cite both ways gets one number and one line in the reference list.
An entry without a DOI or a URL is shown as plain text, from the entry itself.

`raven` tells you about a file that doesn't parse, a key defined twice, and a citation whose key no file defines.
It won't fetch a bibliography from a URL: download the file and name the local copy.

## Other uses of `ref`

The `ref` keyword is also used to link to a figure or table within a publication: see [](#authors:ref-figure).
