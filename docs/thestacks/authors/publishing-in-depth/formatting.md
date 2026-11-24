---
description: Format your Google Doc so it imports cleanly, including figures, tables, math, and callouts.
---

# Formatting your Google Doc

The Stacks reads two kinds of formatting from your Google Doc:

- **Native Google Docs formatting** such as headings, bold, italic, lists, tables, and links.
- **Google Docs directives**, which are text markers you type into the doc to create richer blocks like figures and callouts.
  They're similar to [MyST directives](https://mystmd.org/guide/directives), but are an independent variant for Google Docs.
  We try to keep the two in sync, but they can differ.

To see these features in published work, see [](#authors:things-to-try).

(authors:before-import)=

## Before you import

Share every Drive file you reference, such as images and videos, the same way as your doc (see [](#authors:import-google-doc)).
If even one file is private, the import fails.

Accept or reject all suggested edits, because suggestions and comments aren't imported.

(authors:what-carries-over)=

## What carries over

Semantic formatting is kept: headings, bold, italic, superscript, subscript, links, lists, tables, and paragraph alignment.
Use Google Docs' built-in paragraph styles for headings.

Visual styling is dropped: highlight, font color, fonts and sizes, underline, strikethrough, line spacing, and page breaks.
Footnotes, text boxes, and drawings are dropped too, so export drawings as images and add them as [media](#authors:media).

:::{warning} These break the import

- **Equation objects** (Insert → Equation). Write math as LaTeX instead (see [](#authors:math)).
- **Smart chips** (anything inserted by typing `@`). Paste links as plain text.

:::

(format:directives)=

## How Google Docs directives work

A directive is a fenced block you type as plain text in your doc:

```text
:::directive-name
:attribute: value
:another-attribute: value
Free-form content, like a caption.
:::
```

- Put the opener (`:::media`) and closer (`:::`) on their own paragraphs, with nothing else on the line, not even a leading space.
- Put each attribute on its own paragraph, formatted `:key: value`.
- Use a real new paragraph (Enter), not a soft line break (Shift+Enter).
- Don't use Google Docs' "Code block" element for directives. Type the characters as normal text.

Styling directive text in a monospace font with a grey background makes it easier to spot, and doesn't affect the import.

(authors:document-structure)=

## Document structure

A publication is laid out as title, subtitle, abstract, body sections, and then acknowledgments.

- **Title**: the first paragraph, using the "Title" paragraph style. Only one.
- **Subtitle**: optional, directly after the title, 280 characters or fewer.
- **Abstract**: can span multiple paragraphs.
- **Sections**: Heading 1 for top-level sections, Heading 2 and below for subsections. Only H1 and H2 appear in the table of contents.

```text
:::subtitle
One sentence on the impact of this work.
:::

:::abstract
First paragraph of the abstract.

Second paragraph of the abstract.
:::
```

Acknowledgments and competing interests each go in a `bordered` block.
The heading inside must be Heading 4.

```text
:::bordered
:internal: acknowledgments
#### Acknowledgments
Thank collaborators, funders, and contributors here.
:::

:::bordered
:internal: competing interests
#### Competing interests
Declare any conflicts of interest here.
:::
```

(authors:media)=

## Figures and other media

The `:::media` directive handles images, videos, audio, embeds, and file downloads.
The `:type:` attribute picks which one.

```text
:::media
:type: image
:id: growth-curves
:src: https://drive.google.com/file/d/1AbcDefGhiJklMnoPqr/view?usp=sharing
:width: 100%
:align: center
:alt: Nine growth curves arranged in a grid, one per temperature.
**Growth rate varies with temperature across all 84 isolates.**
Each panel shows OD600 over time for one temperature condition.
:::
```

### Attributes

| Attribute              | Used by              | Notes                                                                                                            |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `:type:`               | all                  | `image`, `video`, `audio`, `iframe`, or `file`                                                                   |
| `:src:`                | all                  | A public URL. Placeholder text or an empty value fails the import.                                               |
| `:id:`                 | all but `file`       | Unique, case-sensitive, and **no underscores**. Use descriptive kebab-case like `growth-curves`, not `figure-2`. |
| `:alt:`                | all but `file`       | One or two sentences describing the content, for accessibility.                                                  |
| `:align:`              | all but `file`       | `center`, `left`, or `right`, lowercase.                                                                         |
| `:width:`              | image, video, iframe | Must include a unit, like `100%` or `400px`. Prefer `%`.                                                         |
| `:unnumbered:`         | image, video         | `true` to skip "Figure N" numbering, for example on a decorative image.                                          |
| `:autoplay:`, `:loop:` | video                | `true` to enable.                                                                                                |
| `:aspect-ratio:`       | iframe               | Width/height ratio, like `4/3`.                                                                                  |
| `:height:`             | iframe               | A fixed pixel height, like `550px`, instead of an aspect ratio.                                                  |
| `:filename:`           | file                 | The file name readers see. File blocks take no caption.                                                          |

Store figures at their best resolution.

Supported formats:

- **Images**: JPEG, PNG, GIF, SVG, WEBP
- **Video**: AVI, MOV, MP4
- **Audio**: MP4, WAV, OGG, M4A

### Captions and numbering

- Write the caption after the last attribute and before the closing `:::`, with no attribute prefix.
- Bold the first sentence as the caption title.
- Figures are numbered automatically ("Figure 1", "Video 1") in document order. Don't number them yourself.

(authors:alignment)=

### Alignment

`left` and `right` float the figure and wrap text around it.
Use them only for narrow figures, roughly 65% width or less.
Wide figures won't float on The Stacks even if you set `left` or `right`.

For YouTube videos, use the embed URL, like `https://www.youtube.com/embed/0peLwtqQX7I`, not the `watch?v=` URL.

(authors:tables)=

## Tables

Use a native Google Docs table (Insert → Table).

- Make every cell in a row bold to format it as a header row.
- Bold, italic, links, and super/subscript work inside cells.
- Column alignment set in Google Docs is not kept.

To caption and number a table, add a `:::meta` block right after it:

```text
:::meta
:id: strain-list
**Wild strains used in this study.**
Twenty representative strains from the full panel.
:::
```

(authors:ref-figure)=

## Referencing figures and tables

Type `:ref{#id}` in your text, using the `:id:` of the figure or table:

```text
We summarize the trend in :ref{#growth-curves}.
```

- The `#` is required.
- Type it as plain text, not as a Google Docs link.
- The Stacks replaces it with the right number, like "Figure 1".

Note: `ref` is also used for citations. See [](citations.md).

(authors:math)=

## Math

Write math as LaTeX.
Use `$...$` for inline math and `$$` fences on their own paragraphs for block math:

```text
We normalized readings as $\log(1 + x)$.

$$
\mu_{\text{max}} = \frac{\ln(\text{OD}_{t_2}) - \ln(\text{OD}_{t_1})}{t_2 - t_1}
$$
```

Don't put bold or italic formatting inside the dollar signs.

(authors:code)=

## Code

Wrap inline code in single backticks.
It's fine if Google Docs turns it into green monospace text.

For code blocks, use triple-backtick fences with a language name.
Paste the code with **Paste without formatting** (⌘+Shift+V or Ctrl+Shift+V), or The Stacks won't recognize it.

````text
```r
library(tidyverse)
growth_data |> group_by(strain_id, temperature)
```
````

See the [list of supported languages](https://github.com/wooorm/lowlight#data).

## Callouts

```text
:::callout
**Data and code** for this pub are in [this repository](https://github.com/example/repo).
:::
```

Callouts can contain paragraphs, lists, links, and media blocks.

(authors:collapsible)=

## Collapsible content

Use `:::details` to hide content behind a click-to-expand toggle.
An optional `:::summary` right after the opener stays visible when it's collapsed.

```text
:::details
:::summary
## Bonus data: one strain shows unusual cold tolerance
:::
This content is hidden until the reader expands it.
:::
```

- Add `:open: true` under `:::details` to expand it by default.
- Use only one `:::summary` per `:::details`, and don't nest it inside another directive.

(authors:internal-links)=

## Links within your doc

- **To a heading**: select your text, press ⌘+K, and pick the heading from "Headings and bookmarks". You can also type the heading's slug as the URL, like `#our-results`. The slug is the heading text in lowercase with hyphens. If two headings have the same text, the second one's slug ends in `-1`, the third's in `-2`, and so on. Headings in the abstract count, and so does the "Purpose" heading The Stacks puts above it.
- **To anywhere else**: add a bookmark (Insert → Bookmark), then link to it with the "Headings and bookmarks" picker. The bookmark must be at the start of a paragraph and followed by plain text.

If you rename a heading, update any links you typed with its old slug. Links made with the picker follow the heading.

## Web-only content

Wrap content in `:::only` to leave it out of the PDF export, for example a feedback poll:

```text
:::only
:platform: web
:::media
:type: iframe
:src: https://example.typeform.com/to/feedback
:align: center
:width: 100%
:height: 550px
:::
:::
```

Don't use this for interactive figures that are part of your argument.
By default, The Stacks puts a screenshot of them in the PDF.

## Small text

You can use HTML as an escape hatch to use styles that are not covered by standard Markdown or Google Docs directives. For example, you can get small text with HTML.

```text
<span class="text-body-20">Small text content.</span>
```

## Citations

See [](./citations.md).
