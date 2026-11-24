---
description: Publish a MyST document on The Stacks with the raven command line tool.
---

# Quickstart with MyST

To publish a [MyST](https://mystmd.org) document on The Stacks, we need to do the following steps:

1. Write the document, with its contributors and license in the frontmatter
2. Log in with the `raven` command line tool
3. Create a draft and pick a community
4. Edit and push changes
5. Release the publication

This quickstart will walk you through these steps. If you write in Google Docs instead, see [](./quickstart.md).

## Before you start

You need an account on The Stacks that is allowed to publish; see [](#authors:who-can-publish).

You also need the `raven` command line tool. It will soon be available on the GitHub page for the project. In the meantime reach out to us to get access.

% Download it for your platform from the [latest GitHub release](https://github.com/Astera-org/raven/releases),

Once you have the CLI, put `raven` on your `PATH`.

:::{tip}
macOS blocks executables downloaded with a browser until they are notarized. Download `raven` with `curl` or `gh release download`, or run `xattr -d com.apple.quarantine raven` after extracting it, if downloaded from a browser.
:::

## Step 1: Write the document

We first need some content to publish. In this quickstart, you write the content in MyST. If you are unfamiliar with it, the [MyST quickstart](https://mystmd.org/guide/quickstart-myst-documents) gives you a brief introduction. You do not need to build the project with `myst`: The Stacks renders the document itself.

:::{tip}
Do you have a LaTeX source you would like to publish on The Stacks? `raven` only reads MyST (`.md`) files, but an LLM can convert LaTeX to MyST. Check the result, especially citations (see [](#authors:cite-myst) for declaring your `.bib` files), figure paths, and custom macros. Use `--dry-run` ([Step 3](#quickstart-myst:create)) to check local file paths, then review the warnings and rendered draft after creating it: the dry run does not validate citation resolution or rendering.
:::

For the quickstart, we will use a simple example. Save the following as `paper.md`. Replace the author's name and ORCID iD with your own:

````md
---
title: How ravens plan ahead
subtitle: Evidence from caching and tool use
abstract: |
  This work reviews evidence that ravens plan for future needs.
license: CC-BY-4.0
keywords: [Perspective, corvids, planning]
authors:
  - name: Alice Example
    orcid: 0000-0002-1825-0097
    roles: [Conceptualization, Writing]
---

## Background

Scrub jays cache food with the future in mind {cite}`10.1038/35106560`.

```{figure} https://upload.wikimedia.org/wikipedia/commons/b/b8/Corvus_corax_%28NPS%29.jpg
:label: fig-raven
:alt: A common raven perched on a rock

A common raven (_Corvus corax_). Public domain, U.S. National Park Service.
```

{numref}`fig-raven` shows a raven.
````

The frontmatter fills in the publication's fields (see the [MyST frontmatter reference](https://mystmd.org/guide/frontmatter) for all the options):

- `title`, `subtitle`, and `abstract` become the title, subtitle, and **Purpose** of the publication. The rest of the file is the _body_.
- `keywords` become the publication's tags. Include its [pub type](#authors:pub-types), such as `Result`, `Method`, `Idea`, or `Perspective` (as here), so readers can see what kind of work it is.
- `license` is `CC-BY-4.0` (CC BY) or `CC0-1.0` (CC0). **CC BY** lets others share and adapt your work as long as they credit you, and is the most common choice for research. **CC0** waives all copyright, and is best suited to raw data.
- `authors` are the contributors. An author whose ORCID iD or email matches a Stacks user is added to the byline, with the roles listed in `roles`: the roles the draft page offers, such as `Conceptualization`, `Software`, or `Writing`, or the matching [CRediT roles](https://credit.niso.org/). An author with no such role gets `Writing`. Authors who do not match a user are reported as warnings and left out. See [](#authors:contributors) for more on contributors and the byline.

The document cites by DOI and shows an image from the web, so it needs no other files. Local images and BibTeX files work too, at paths relative to the file: `raven` uploads them with the document (see [](#authors:cite-myst) for citing by bibliography key). For what MyST features The Stacks supports, see [](#format:myst-limits).

:::{tip}
A MyST project (a directory with `myst.yml`) works too: pass the directory instead of the file, and add `--page <file>` if the project has more than one page.
:::

## Step 2: Log in

Log in to The Stacks:

```sh
raven auth login https://api.thestacks.org
```

This opens The Stacks in your browser to approve the login. Run `raven auth status` to check who you are logged in as.

(quickstart-myst:create)=

## Step 3: Create a draft and pick a community

The community is where the publication lives on The Stacks, and its members are notified when you release it. You can set the community when creating the draft, or you can leave it empty and set it in the UI before releasing. Run `raven orgs list` to find the slug of your community if you want to include it as an argument when creating a draft.

The `pubs create` command creates a new draft. Use `--dry-run` first to see what would happen without creating anything:

```sh
raven pubs create paper.md --dry-run
```

Then create the draft:

```sh
raven pubs create paper.md
```

To set the community now, add `--org example-lab` (with your community's slug) to either command.

`raven` creates the draft, reports any warnings (such as an author it could not match or a citation it could not resolve), and prints a link to the draft on The Stacks. It also records the link between `paper.md` and the publication in `.raven/publications.json`, so later commands know which publication to update.

The new publication gets a _slug_, the part of its URL that identifies it, as in `thestacks.org/publications/<slug>`. The Stacks generates it from the title; to choose your own, add `--slug how-ravens-plan-ahead` when creating the draft. You can change the slug on the draft page until you release the publication.

Open the link to see how the publication will look. You can change the community, contributors, and other [publication fields](#authors:publication-fields) on the draft page at any time.

## Step 4: Edit and push changes

Edit `paper.md` and replace the draft with it, as often as you like:

```sh
raven pubs push paper.md
```

`push` replaces the title, subtitle, abstract, and body with the contents of the file, replaces all tags with `keywords`, and adds any new authors to the contributors. Before the first release, it also applies `license` when supplied. Keep your intended tags and license in `paper.md`, including any changes made on the draft page.

:::{important}
Treat `paper.md` as the source of truth: changes made to the title, abstract, or body on the draft page are lost when you next push. If the draft was changed on the server since your last push, `push` refuses to overwrite it; run `raven pubs get paper.md --draft --rebuild > server.md` to see the draft as MyST, merge the changes into `paper.md`, and push again.
:::

## Step 5: Release the publication

You release the publication on The Stacks, where you can review the draft first. Open the link that `raven pubs create` or `raven pubs push` printed.

When everything the publication needs is filled in, the {gui}`Release publication…` button at the bottom of the draft becomes available. If something is still missing, a list above the button tells you what to fix.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--release-bar.png
:label: quickstart-myst:release-bar
:alt: The Ready to release? bar, with Save draft and Release publication buttons.
:align: center
:width: 75%

Click {gui}`Release publication…` when you are ready.
```

Click {gui}`Release publication…`.

- Check the slug to make sure it is what you want
- Confirm that all byline authors have consented to the release
- Optionally add a release note

Then click {gui}`Release publication` in the dialog box.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--release-dialog.png
:label: quickstart-myst:release-dialog
:alt: The release dialog, with the consent checkbox ticked, an empty Release note field, and a Release publication button.
:align: center
:width: 60%

Check the slug to make sure it is what you want, confirm that the byline authors consent, then release the publication.
```

:::{important}
Once released, the publication is publicly accessible, and the license, slug, and DOI become fixed.
:::

Your publication is now live on The Stacks. To change it later, edit `paper.md`, run `raven pubs push paper.md`, and release a new version from the draft page; see [](./publishing-in-depth/versions-and-dois.md).
