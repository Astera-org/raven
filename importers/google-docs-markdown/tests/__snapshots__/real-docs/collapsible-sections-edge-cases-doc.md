# Case 01· Baseline

## Summary is a single heading

The common case, and the one already approved. The caret sits in the left gutter, optically centered on the heading's first line. Heading text stays flush with body text.

::::::details

:::::summary
## The approach
:::::

We arrayed all 84 strains across nine temperature conditions spanning 12–42 °C and read OD600 every fifteen minutes for thirty-six hours.

::::::

# Case 02

## Summary is a heading plus a paragraph

The guide's own worked example. The caret anchors to the first line of the first block in the summary and stays there; every summary block remains visible when collapsed.

::::::details

:::::summary
## Bonus data: a single outlier strain shows unusual cold tolerance

While not part of the main pattern, one strain (SC-B-021) grew faster at 12 °C than any other isolate.
:::::

We isolated SC-B-021 from a Norwegian permafrost sample. Its growth profile is qualitatively different from other boreal strains, with a sharp drop in growth rate above 25 °C and a peak at 16 °C, the lowest temperature we tested.

::::::

# Case 03

## Summary is three paragraphs, no heading

A caret pinned to the first line is now a long way from where the reader finishes reading, so it stops reading as a control. Recommendation: keep the caret in the gutter as the region marker, and add an explicit text affordance after the last summary block. Both toggle the same region.

::::::details

:::::summary
Three strains resisted every attempt at transformation, which cost us most of a month before we changed our approach.

The lithium-acetate protocol that worked for the other 81 isolates produced no colonies at all for SC-T-011, SC-M-003, and SC-B-019, across four independent attempts and two competent-cell preparations.

We eventually moved those three to electroporation and recovered usable transformants. The full troubleshooting record is below for anyone who hits the same wall.
:::::

1. Fresh competent cells, standard lithium acetate: no colonies.
2. Doubled carrier DNA and extended heat shock to 45 minutes: no colonies.
3. Switched selection plates in case of a marker problem: no colonies.
4. Electroporation at 1.5 kV: transformants for all three within two days.

::::::

# Case 04 · Gap in the current design

## No summary at all

The guide allows details with no summary. Nothing is visible when collapsed, so there is no heading to hang a caret on. Recommendation: render a standalone toggle row with a caret and a generic mono label. This is the only case where the platform supplies its own copy.

::::::details
Plate reader calibration was checked against a dilution series at the start and end of every run. Drift never exceeded 2% of the measured OD.
::::::

# Case 05

## Summary is a figure, with no text

A tall block has no first line to center on. Recommendation: the caret top-aligns to the figure's first band rather than centering on the whole height, so it never floats in the middle of an image. The caption stays part of the always-visible summary.

::::::details

:::::summary

::::figure{type="image"}

:::image{src="raven-media://media-1"}
:::

::::

Figure 1: Growth rate against temperature, tropical (peach) and boreal (dark) strains.

:::::

Curves are LOESS fits across three biological replicates per strain per temperature. Shaded intervals were omitted here for legibility; the per-replicate values are in the supplementary spreadsheet.

::::::

# Case 06

## Hidden content is a figure on its own

No prose to set the rhythm, so the rail runs against the figure's border directly. The gap between rail and figure edge matches the gap between rail and body text, which keeps the inset consistent whatever the region holds.

::::::details{open="true"}

:::::summary
## Per-replicate growth curves
:::::

:::::figure{type="image"}

::::image{src="raven-media://media-2"}
::::

:::::

Figure 2: Three replicates per condition for SC-T-042 at 30 °C.

::::::

# Case 07

## A callout inside a collapsible

The guide requires the callout's backing color to resize to whatever is visible without bleeding past the section boundary. The callout collapses as one box and takes no rail of its own, so two indicators never stack.

::::::details{open="true"}

:::::summary
## Data and code
:::::

:::::div{.info-box}

::::details

:::summary
#### Availability
:::

The full strain panel, raw OD600 time courses, and the analysis pipeline are available in the project repository, archived under a versioned DOI.

::::

:::::

::::::

# Case 08

## A collapsible inside a collapsible

Each level steps in by one gutter and the caret steps down one size, so depth is legible without a second rail color. Two levels is the practical limit; a third reads as an outline rather than prose.

::::::details{open="true"}

:::::summary
## Methods
:::::

Strains were revived from glycerol stocks and passaged twice before assay.

:::::details

::::summary
### Plate layout and randomisation
::::

Strain positions were randomised per plate to decouple strain identity from edge effects, and every plate carried four blank wells for background subtraction.

:::::

::::::

# Case 09

## A reference pointing into collapsed content

Figures auto-number in document order whether or not they are visible, so a ref can point at a figure the reader cannot see. Recommendation: the reference expands its containing section, scrolls to the target, and flashes it once. Try the link below.

Replicate agreement was high across the whole panel ([collapsible-reference-target](#collapsible-reference-target)), which is why the main figures show fitted curves only.

::::::details{#collapsible-reference-target}

:::::summary
## Replicate agreement, all conditions
:::::

:::::figure{type="image"}

::::image{src="raven-media://media-3"}
::::

:::::

Figure 3: Replicate one against replicate two across all 84 strains and nine conditions.

::::::

