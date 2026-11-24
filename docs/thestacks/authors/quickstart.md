---
description: A quick guide to getting a publication on The Stacks.
---

# Quickstart with Google Docs

To publish on The Stacks, we need to do the following steps:

1. Import the document
2. Describe the contributors
3. Pick a community that will be the home of the publication
4. Pick a license
5. Release the publication

This quickstart will walk you through these steps. If you write in MyST instead, see [](./quickstart-myst.md).

## Step 1: Import the document

For the quickstart, we will import the Google Doc pub template. The template is a Google Doc that demonstrates use of some common formatting and [Google Docs directives](#format:directives) and can be used as the starting point for a publication.

[Google Doc Template](https://docs.google.com/document/d/1f1pNvIOJ7necaCLHxc6WR2hNkRWqFkIia1hGTOyuU-w/edit?tab=t.0#heading=h.89rs1guw2zhk)

Click {gui}`Create a pub` in the navigation bar, paste the link to the template into the field, and click {gui}`Import`.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--import-google-doc.png
:label: quickstart:import-google-doc
:alt: The Create a pub page, with a Google Doc link pasted into the field and an Import button.
:align: center

Paste the link to the Google Doc and click {gui}`Import`.
```

When The Stacks imports a Google Doc, it looks for the first paragraph using the "Title" paragraph style (this becomes the _title_) and directives specifying the _subtitle_ and _abstract_. If these are found, they will be removed from the main text and used to populate those fields. The rest of the content goes into the _body_ (including figures and citations in the document).

After import, you will be on a form for the draft. You can close the draft at any time and continue working on it later. Unfinished drafts are shown in the {gui}`Your unfinished Pubs` section of the import page.

:::{tip}
Make sure the sharing permission for a doc you import is set to {gui}`Anyone with the link`. That is necessary for The Stacks to read it.
:::

The draft page lets you iterate on your publication and configure how it will appear in The Stacks. Your changes save automatically as you go. The {gui}`Details` section is where you provide metadata that The Stacks needs to publish a publication.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--details.png
:label: quickstart:details
:alt: The Details section of a draft, showing the contributors table, the License field, and the Community field.
:align: center

The contributors, license, and community in the {gui}`Details` section of the draft.
```

The {gui}`Details` section also has the publication's tags and slug:

- **Tags** classify the publication. Add its [pub type](#authors:pub-types), such as {gui}`Result`, {gui}`Method`, or {gui}`Idea`, so readers can see what kind of work it is.
- The **slug** is the part of the publication's URL that identifies it, as in `thestacks.org/publications/<slug>`. The Stacks generates it from the title, and you can change it until you release the publication.

## Step 2: Add the contributors

Click {gui}`Add contributor` and search for each person who contributed to the publication. For each contributor, pick one or more [CRediT roles](https://credit.niso.org/) that describe their contribution to the work.

Contributors are by default affiliated with the organization of the community for the publication ([more on communities below](#quickstart:pick-a-community)). If the default is not appropriate, you can set a different affiliation for any contributor. Multiple affiliations are allowed.

Turn on {gui}`Byline` for the contributors who signed off on the publication. Byline authors appear in the citation; the other contributors are credited but not listed as authors. See [](#authors:contributors) for more on the difference.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--contributors.png
:label: quickstart:contributors
:alt: The contributors table with one contributor, a Conceptualization role, and the Byline toggle turned on.
:align: center

Each contributor has an affiliation, CRediT roles, and a {gui}`Byline` toggle.
```

(quickstart:pick-a-community)=

## Step 3: Pick a community

The community is where the publication lives on The Stacks, and its members are notified when you release it. Pick one from the {gui}`Community` menu. If the work belongs to more than one community, click {gui}`Add another community`.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--community.png
:label: quickstart:community
:alt: The Community field with Example Lab selected and an Add another community button.
:align: center

Pick the community that will be the home of the publication.
```

## Step 4: Pick a license

Pick the Creative Commons license that governs how others can use your work:

- **CC BY** lets others share and adapt your work as long as they credit you. It is the most common choice for research.
- **CC0** waives all copyright, so anyone can use your work for any purpose. It is best suited to raw data.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--license.png
:label: quickstart:license
:alt: The License field with CC BY selected and CC0 not selected.
:align: center

Pick {gui}`CC BY` or {gui}`CC0`.
```

:::{important}
The license is locked once the publication is released, and so are the slug and the DOI.
:::

## Step 5: Release the publication

When everything the publication needs is filled in, the {gui}`Release publication…` button at the bottom of the draft becomes available. If something is still missing, a list above the button tells you what to fix.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--release-bar.png
:label: quickstart:release-bar
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
:label: quickstart:release-dialog
:alt: The release dialog, with the consent checkbox ticked, an empty Release note field, and a Release publication button.
:align: center
:width: 60%

Check the slug to make sure it is what you want, confirm that the byline authors consent, then release the publication.
```

Your publication is now live on The Stacks. To change it later, release a new version; see [](./publishing-in-depth/versions-and-dois.md).
