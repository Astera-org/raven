---
description: Fixes for common problems with importing, formatting, citations, and releasing.
---

# Troubleshooting

Each entry describes a problem, how to fix it, and where to read more.

## The import fails or The Stacks can't read the doc

- Set the doc's sharing to {gui}`Anyone with the link` as {gui}`Viewer`.
- Share every Drive file the doc references, such as images and videos, the same way. If even one file is private, the import fails.
- Paste a Google Doc URL. The draft interface doesn't accept other sources.

See [](#authors:import-google-doc) and [](#authors:before-import).

## The import fails on an equation or a link

**Equation objects** (Insert → Equation) and **smart chips** (anything inserted by typing `@`) break the import.
Write math as [LaTeX](#authors:math) and paste links as plain text.
See [](#authors:what-carries-over).

## The import fails on a figure

Every `:src:` must be a public URL.
Placeholder text or an empty value fails the import.
See [](#authors:media).

## I can't find my draft

Unfinished drafts are listed in the {gui}`Your unfinished Pubs` section of the {gui}`Create a pub` page.

## My edits on The Stacks disappeared after re-importing

Re-importing replaces the _title_, _subtitle_, _abstract_, and _body_ with the content of the Google Doc.
If you work from the Google Doc, make your changes there instead of on the draft page.
See [](#authors:import-google-doc).

## The title, subtitle, or abstract wasn't picked up

- The title is the first paragraph using the "Title" paragraph style.
- The subtitle goes directly after the title, in a `:::subtitle` block of 280 characters or fewer.
- The abstract goes in an `:::abstract` block.

See [](#authors:document-structure).

## A directive shows up as plain text

- Put the opener (`:::media`) and closer (`:::`) on their own paragraphs, with nothing else on the line, not even a leading space.
- Put each attribute on its own paragraph, formatted `:key: value`.
- Press Enter for a new paragraph, not Shift+Enter.
- Type directives as normal text, not in Google Docs' "Code block" element.

See [](#format:directives).

## Formatting, footnotes, or drawings are missing

The Stacks keeps semantic formatting but drops visual styling: highlight, font color, fonts and sizes, underline, strikethrough, line spacing, and page breaks.
Footnotes, text boxes, and drawings are dropped too; export drawings as images and add them as [media](#authors:media).
Suggested edits and comments aren't imported, so accept or reject them first.
See [](#authors:what-carries-over).

## A section is missing from the table of contents

Only Heading 1 and Heading 2 appear in the table of contents.
See [](#authors:document-structure).

## The acknowledgments or competing interests block looks wrong

The heading inside each `bordered` block must be Heading 4.
See [](#authors:document-structure).

## A figure doesn't float or wrap text

`left` and `right` only float narrow figures, roughly 65% width or less.
The value must be lowercase.
See [](#authors:alignment).

## A figure's width is ignored

`:width:` needs a unit, like `100%` or `400px`.
See [](#authors:media).

## A figure reference isn't replaced with a number

- Include the `#`: `:ref{#growth-curves}`.
- Type it as plain text, not as a Google Docs link.
- Check that it matches the figure's `:id:` exactly. IDs are case-sensitive and can't contain underscores.

See [](#authors:ref-figure).

## Figures are numbered twice

The Stacks numbers figures automatically. Remove your own numbering from the captions.
See [](#authors:media).

## A YouTube video doesn't play

Use the embed URL, like `https://www.youtube.com/embed/0peLwtqQX7I`, not the `watch?v=` URL.
See [](#authors:alignment).

## A table has no header row, or its alignment is lost

Make every cell in a row bold to format it as a header row.
Column alignment set in Google Docs is not kept.
See [](#authors:tables).

## A code block isn't recognized

Paste the code with **Paste without formatting** (⌘+Shift+V or Ctrl+Shift+V), inside triple-backtick fences.
See [](#authors:code).

## Math doesn't render

Don't put bold or italic formatting inside the dollar signs, and put `$$` fences on their own paragraphs.
See [](#authors:math).

## A collapsible section looks wrong

Use only one `:::summary` per `:::details`, directly after the opener, and don't nest it inside another directive.
See [](#authors:collapsible).

## A link within the doc is broken

- For a heading, pick it from "Headings and bookmarks", or type its slug as the URL, like `#our-results`.
- If two headings have the same text, a typed `#our-results` goes to the first one. Use `#our-results-1` for the second, or pick it from "Headings and bookmarks".
- If you renamed a heading, update links you typed with its old slug.
- If you deleted a heading, links to it are kept as plain text.
- A bookmark must be at the start of a paragraph and followed by plain text.

See [](#authors:internal-links).

## A citation is missing from the reference list

Only `:ref` links become citations.
A bare DOI string, a visible link to a journal, PubMed, or bioRxiv page, and the Google Docs "citation" feature all render as ordinary text or links.

- Select exactly the four characters `:ref`, with no surrounding spaces, before adding the link.
- Separate citations in a row with a single space.

See [](#authors:cite-doi).

## A citation of software or a website doesn't resolve

The `url` in the `@Misc` entry must exactly match the `:ref` link.
Put the `:::bibtex` block at the end of the doc, after the acknowledgments, and start each entry with `@` on its own line.
See [](#authors:cite-no-doi).

## I can't publish on The Stacks

Publishing is currently restricted to participants in projects at Arcadia Science and at the Astera Institute.
See [](#authors:who-can-publish).

## The {gui}`Release publication…` button isn't available

A required field is still missing.
The list above the button tells you what to fix.
See [](#authors:release).

## My publication has no DOI

DOIs are only minted if your organization has [DOI minting](xref:raven#admins:doi-minting) turned on.
See [](./publishing-in-depth/versions-and-dois.md).

## I can't change the slug, license, or DOI

These are locked once the publication is first released.
Other changes ship as a [new version](#authors:versions).

## {gui}`Edit` opens an old draft

If a draft of the next version already exists, {gui}`Edit` opens it instead of starting a new one.
See [](#authors:versions).
