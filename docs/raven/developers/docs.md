---
description: Build, preview, and edit the Raven and The Stacks documentation sites.
---

# Documentation

These docs are two [MyST Document Engine](https://mystmd.org)[^1] sites:

- `docs/raven/` is this site, for the backend software that powers the stacks
- `docs/thestacks/` is for the hosted distribution of Raven for the "The Stacks" service

Each site is self-contained and will probably live in its own repository one day.
Link to the other site with an [external reference](https://mystmd.org/guide/external-references), like `[](xref:thestacks#about:coolify)`, with the host set once under `project.references` in `myst.yml`.
Put the label on a defining paragraph, not above a page's title, or the reference won't resolve.
References load the other site's published `myst.xref.json`, so they resolve only once that site is deployed.

[^1]: This is the same document engine and markdown syntax that The Stacks uses!

## Preview and build

From the repository root (or run `pnpm live:thestacks`, `pnpm live:raven` and `pnpm build` from `docs/`):

```bash
pnpm install
pnpm -F @raven/docs live:thestacks  # The Stacks site at http://localhost:3000
pnpm -F @raven/docs live:raven      # this site at http://localhost:3001
pnpm -F @raven/docs build           # static HTML in docs/*/_build/html
```

Some pages in The Stacks docs have `{code-cell}` examples that call the live site.
The deployed docs run them and show their output.
To see the output locally, install [uv](https://docs.astral.sh/uv/) and run:

```bash
pnpm -F @raven/docs live:thestacks:execute
```

## How the docs are organized

- **One section per audience**: readers, authors, admins, deployers, and developers.
- **Short index pages**: each section's `index.md` is a short intro followed by a list of its pages.
- **Reuse, don't copy**: `{include}` a README or link to another source instead of restating it.
- **Define terms once, then link to them**: label the definition `(folder:name)=`, where `folder` is the page's folder, like `(admins:doi-minting)=`. Link to it from other pages with `[DOI minting](#admins:doi-minting)` to show a hover preview.
- **Mark gaps in place**: when a step isn't written yet, add its heading with a `:::{warning} To be filled` that says what goes there and links the issue that tracks it.

## Explain a product decision

We aim to share our rationale for some of the more interesting or non-obvious product decisions for The Stacks.
For example, withdrawing comments instead of deleting them.

To explain a product decision, add a page to `docs/thestacks/decisions/`, and link to it from the relevant spot.
Here are some steps to follow.

1. Copy an existing decision page and fill in **Decision**, **Why**, and **In the code**.
2. Put the `(decisions:name)=` label on the bullet list, not the title, so links to it show a hover preview.
3. Link to in the docs wherever relevant. it from the sentence where readers learn the rule. For example: `[why?](#decisions:comment-withdrawal)`.

Links to decision pages from The Stacks documentation are styled as a small pill automatically.

## Add a page

1. Create a Markdown file in `docs/raven/` or `docs/thestacks/`.
2. Add it to the `toc` in that site's `myst.yml`.

## Screenshots

Screenshots of The Stacks are generated, not taken by hand.
`docs/screenshots/` drives a local Stacks frontend against a dedicated backend deployment and writes the PNGs, so they can be regenerated whenever the UI changes.
See its [README](https://github.com/Astera-org/raven/tree/main/docs/screenshots) to run it.
The PNGs are not committed; they are uploaded to S3 and the docs reference them there.

## Styling

The site uses MyST's [book-theme](https://mystmd.org/guide/website-templates), restyled to match the [brand guidelines](xref:thestacks/about/brand) of The Stacks.
The Raven site `extends` the Stacks config to reuse its styles, which are in `docs/thestacks/brand.css` and mostly overrides the [theme's CSS variables](https://myst-theme.netlify.app/theming/).
The Stacks logos and favicon are loaded from the brand guidelines folder, so they aren't copied.

:::{warning} To be filled
Raven has no logo or favicon of its own yet, so the Raven site shows text only.
When we've defined them, we should add them in `docs/raven/myst.yml` under `site.options`.
:::

## Hosting

`docs/Dockerfile` builds both sites and serves them with nginx at `/raven/` and `/thestacks/`.
`/` redirects to `/thestacks/`, and missing pages get the branded `docs/404.html`.
Staging serves it at `docs.staging.thestacks.org` and production at `docs.thestacks.org`.

The docs host is written into the sites in a few places that can't be relative: the `references` each site uses to link to the other, `internal_domains`, the `nav` links, and a few pages.
The source names the production host everywhere, and the image swaps in the host given by the `DOCS_HOST` build argument, which defaults to production.
For staging, pass the staging host:

```bash
docker build -f docs/Dockerfile --build-arg DOCS_HOST=docs.staging.thestacks.org -t raven-docs .
```

Locally, `myst start` uses the source as is, so cross-site links point at production.
When you add a link to the other site, use a `raven:` or `thestacks:` reference rather than a full URL.
If you do write a full URL, use the production host so the build can swap it.

:::{important} Building for a new host
To resolve `raven:` and `thestacks:` references, MyST downloads the other site's `myst.xref.json` from the docs host while building.
So a build for a host that isn't serving the docs yet can't resolve them.
Build with a host that already serves the docs, deploy, then rebuild with the new `DOCS_HOST` and deploy again.
:::
