---
description: Import a Google Doc and fill in the publication fields.
---

# Creating a publication with Google Doc

Before you import, [format](./formatting.md) your Google Doc and add your [citations](./citations.md).
After importing, preview the publication and fix any formatting issues before publishing.

(authors:import-google-doc)=

## Importing from Google Docs

The Stacks draft interface only accepts Google Doc URLs.

1. Set your Google Doc share permissions to {gui}`Anyone with the link` as {gui}`Viewer`.
2. Copy the shareable URL of your finalized publication.
3. Click {gui}`Create a pub` in the navigation bar, paste the URL, and click {gui}`Import`.

Previous [drafts](#authors:versions) will appear in the **Your unfinished Pubs** section.

:::{tip} Think about your workflow

Some teams like to work with the Google Doc as the single source of truth. If you want to work that way, you should avoid modifying content in the edit page of The Stacks: confine your changes to the source Google Doc and re-import it.

Re-importing a document will update the _title_, _subtitle_, _abstract_/_purpose_, and _body_ to match the Google Doc.
:::

(authors:publication-fields)=

## Filling in publication fields

Once your publication is uploaded and reformatted, fill in each field:

| Field                 | Description                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slug**              | A short identifier used in the URL. Example: `result-raman-mapping-algae` → `thestacks.org/publications/result-raman-mapping-algae`. Letters, numbers, and hyphens. You can change it until you first publish. |
| **DOI**               | Minted if your organization has [DOI minting](xref:raven#admins:doi-minting) turned on. See [](./versions-and-dois.md).                                                                                        |
| **Title**             | Scholarly publication title — a declarative statement of what the work is.                                                                                                                                     |
| **Subtitle**          | Appears in smaller text below the title; a phrase or sentence of impact.                                                                                                                                       |
| **Abstract**          | Renders in The Stacks as **Purpose**. A succinct framing: _"This work introduces/investigates/evaluates…"_ Equivalent to an eLife assessment or an editor's note at the top of a traditional journal.          |
| **Body**              | Where your Google Doc content renders.                                                                                                                                                                         |
| **License**           | [CC BY](https://creativecommons.org/licenses/by/4.0/) (derivative work must credit the publication) or [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (completely open).                            |
| **Contributors**      | See below.                                                                                                                                                                                                     |
| **Community**         | The [organization](xref:raven#admins:organization) that is the home of the publication, such as Radial. Its members are notified when you release.                                                             |
| **Tags**              | See below.                                                                                                                                                                                                     |
| **Additional Assets** | Link to code, data, or other associated materials.                                                                                                                                                             |
| **Feedback form**     | Optional link to a feedback form relevant to your work, or leave blank.                                                                                                                                        |

The contributors, license, and community are set in the {gui}`Details` section of the draft.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--details.png
:label: creating:details
:alt: The Details section of a draft, showing the contributors table, the License field and the Community field.
:align: center

The contributors, license and community in the {gui}`Details` section of the draft.
```

Pick the community from the {gui}`Community` menu. If the work belongs to more than one community, click {gui}`Add another community`.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--community.png
:label: creating:community
:alt: The Community field with Example Lab selected and an Add another community button.
:align: center

Pick the community that will be the home of the publication.
```

Pick the license from the {gui}`License` field.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--license.png
:label: creating:license
:alt: The License field with CC BY selected and CC0 not selected.
:align: center

Pick {gui}`CC BY` or {gui}`CC0`.
```

(authors:contributors)=

## Contributors and byline authors

Contributors follow the [CRediT taxonomy](https://credit.niso.org/) for contributor roles. Not all roles appear on the publication byline.

- **Contributors** include all people who worked on the publication, even in a minor or peripheral role. They receive credit but may not be deeply familiar with the work as a whole.
- **Byline authors** are a subset of contributors whose names appear in the citation and are indexed on Google Scholar. They are generally those "responsible" for the publication — accountable if questions about quality arise.
- Contributor and byline authorship will be defined by the senior corresponding author.

Click {gui}`Add contributor` to add each contributor, pick their CRediT roles, and turn on {gui}`Byline` for the byline authors.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--contributors.png
:label: creating:contributors
:alt: The contributors table with one contributor, a Conceptualization role and the Byline toggle turned on.
:align: center

Each contributor has an affiliation, CRediT roles, and a {gui}`Byline` toggle.
```

(authors:pub-types)=

## Tags

- Tag each publication with its **Pub Type**: [Dataset](#pub-type:dataset), [Idea](#pub-type:idea), [Resource](#pub-type:resource), [Method](#pub-type:method), [Negative data](#pub-type:informative-failure), [Informative failure](#pub-type:informative-failure), [Observation](#pub-type:observation), [Open question](#pub-type:open-question), [Result](#pub-type:result), or [Perspective](#pub-type:perspective).
- Optionally tag it with **`Feedback wanted`**.

Your organization may have its own tagging rules.
For example, Radial's PRISM program also tags every publication with **`Prism`**.

(authors:release)=

## Release / publish

When every required field is filled in, the {gui}`Release publication…` button at the bottom of the draft becomes available.
If something is still missing, a list above the button tells you what to fix.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--release-bar.png
:label: creating:release-bar
:alt: The Ready to release? bar, with Save draft and Release publication buttons.
:align: center
:width: 75%

Click {gui}`Release publication…` when you are ready.
```

Click {gui}`Release publication…`, confirm that all byline authors have consented to the release, optionally add a release note, and click {gui}`Release publication`.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/quickstart--release-dialog.png
:label: creating:release-dialog
:alt: The release dialog, with the consent checkbox ticked, an empty Release note field and a Release publication button.
:align: center
:width: 60%

Confirm that the byline authors consent, then release the publication.
```

When you release:

- The publication goes live on The Stacks.
- Members of its community are notified.
- The license, slug, and DOI are locked.
- Its DOIs, if your organization mints them, become public.

To change the publication after release, publish a new version; see [](./versions-and-dois.md).
