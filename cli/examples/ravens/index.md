---
title: How ravens plan ahead
subtitle: A test publication for the raven CLI
abstract: |
  Ravens cache food and tools for later use, and choose between an
  immediate reward and a better one later [](https://doi.org/10.1126/science.aam8138).
license: CC-BY-4.0
keywords:
  - corvids
  - planning
  - test
---

## Background

Planning for the future was long thought to be unique to humans and great
apes. Scrub jays were the first birds shown to cache with the future in mind
{cite}`10.1038/35106560`, and {cite:t}`10.1126/science.aam8138` showed that
ravens plan for tool use and bartering.

```{figure} raven.svg
:label: fig-sketch
:alt: A line drawing of a raven perched on a branch

A sketch of a raven, uploaded from a local SVG file.
```

:::{note}
This is test content for exercising `raven pubs push`; the findings are
summarised loosely.
:::

## Methods

```{figure} https://upload.wikimedia.org/wikipedia/commons/b/b8/Corvus_corax_%28NPS%29.jpg
:label: fig-raven
:alt: A common raven perched on a rock

A common raven (_Corvus corax_). Public domain, U.S. National Park Service.
```

Birds chose between a tool and a smaller immediate reward, then waited before
the tool could be used. The value of a delayed choice is

$$ V = r \cdot \gamma^{t} $$ (eq-value)

where $r$ is the reward, $t$ the delay and $\gamma$ the discount factor. See
{numref}`fig-raven` and {eq}`eq-value`.

:::{tip}
:class: dropdown
Delays in the original study ranged from 15 minutes to 17 hours.
:::

## Results

```{list-table} Choices of the correct tool
:header-rows: 1
:label: tbl-results

* - Bird
  - Correct choices
* - Huginn
  - 12
* - Muninn
  - 9
```

{numref}`tbl-results` lists illustrative counts.[^counts]

[^counts]: These numbers are made up for testing.

::::{tab-set}
:::{tab-item} Summary
Ravens plan.
:::
:::{tab-item} Details
They plan for tool use and bartering, across delays of up to a day.
:::
::::

```{code} python
:caption: Counting correct choices

choices = {"Huginn": 12, "Muninn": 9}
print(sum(choices.values()))
```
