---
description: Publish your work on The Stacks.
---

# Author guide

The Stacks is a platform designed to offer authors control and flexibility: we want you to have the freedom to decide for yourself **what you publish, when you publish**, and **how it appears**.

(format:source-format)=

## Source formats

A _source format_ is what you write your publication in.
The Stacks supports these formats right now:

- **Google Docs format**: write in a Google Doc and import it. You add figures, callouts, and other rich blocks with [Google Docs directives](#format:directives), text markers you type into the doc.
- **[MyST Markdown](https://mystmd.org)**: write MyST files directly. Most MyST syntax and directives work; see [](#format:myst-limits) for what is not yet supported.

We intend to add more source formats over time.

(format:myst-limits)=

### MyST feature support

The Stacks has opinionated rendering of MyST document and, due to the nature of the site, shows each MyST publication as a single page. A MyST project is not built, so some MyST features do not work yet:

- **Files**: `{include}`, `{literalinclude}` and `{embed}` aren't supported. Images and figures can be local files when you use the `raven` command line tool, which uploads them; otherwise they need absolute URLs.
- **Raw HTML** is left out of the page.
- **Citations** are either DOIs or entries of your own BibTeX files. A citation by bibliography key, such as ``{cite}`smith2020` ``, `@smith2020` or `[@smith2020; @jones2019]`, is resolved when you publish with the `raven` command line tool, which sends your `.bib` files with the document; see [](#authors:cite-myst). A `{bibliography}` directive has no effect: The Stacks builds the reference list itself, from the works your document cites.
- **Code cells** (`{code-cell}`) show their code, but it isn't run, so there are no outputs.
- **Project features**: `{toc}` and `{index}` have no effect, and MyST plugins aren't loaded. The frontmatter `numbering` setting works as it does in `myst build`, so a heading reference such as `§[%s](#sec-methods)` shows the section's number. As there, `headings: true` numbers `##` headings and below; `#` headings are numbered only with `title: true`, which counts the title first. Macros in the frontmatter `math` setting are kept with the document but not applied on the page yet.

When you create or update a MyST publication, The Stacks warns you about includes, embeds, raw HTML and citations it can't link.

(authors:who-can-publish)=

## Who can publish

:::{warning}
Publishing on The Stacks is currently restricted to participants in projects at Arcadia Science and at the Astera Institute.
If you'd like to publish here in the future, [let us know](https://forms.gle/trozK1JUNf2hn9uF9) and we'll note your interest as we expand.
:::

## Quickstart

To publish on The Stacks, you will need a [source document](#format:source-format): a Google Doc with [Google Docs directives](#format:directives), or a MyST file. Bring in the document, add the contributors, and pick a license: now your publication can go live. **The quickstarts walk you through these steps**, [with Google Docs](./quickstart.md) or [with MyST](./quickstart-myst.md).

## Showcase

Browse the [things to try](./things-to-try.md) for examples of Stacks publications that highlight features including:

- [](#try:figures-interactive)
- [](#try:figures-media)
- [](#try:technical-code)

## Publishing on The Stacks in depth

The Stacks takes a different approach to publications than many journals and conferences.

On The Stacks, you can make a publication that describes results of work, as you would for a journal or conference submission, but you can also create publications that describe ideas or how to use a dataset.

A Stacks publication is intended to be a living document that interacts with the broader open-science ecosystem.

**Our [in-depth guide](./publishing-in-depth/index.md) covers these ideas in detail**.
