---
description: Update a published publication and understand how its DOIs work.
---

# Versions and DOIs

(authors:versions)=

## Drafts and versions

Each publication is a series of versions.
You edit a version as a draft, and it becomes public when you publish it.
To change a published publication, publish a new version.
Every change, even a typo fix, is published as a new version.

## Start a new version

Open the publication and click {gui}`Edit` in its header.
This opens a draft of the next version, with the content and details of the current one.
If a draft of the next version already exists, {gui}`Edit` opens that draft instead.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/versions-and-dois--edit-button.png
:label: versions:edit-button
:alt: The header of a released publication, with an Edit button next to its Result tag.
:align: center

Click {gui}`Edit` to start a new version.
```

Make your changes on the draft.
Changes to both the content and the details ship with the next version.

A new version needs a version description that says what changed and why.
Readers see it in the version history.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/versions-and-dois--version-description.png
:label: versions:version-description
:alt: The Version description section of the draft, with the text "Corrected the growth rate units in Figure 2."
:align: center

Describe what changed in the {gui}`Version description` section.
```

When you are ready, click {gui}`Release new version…` at the bottom of the draft.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/versions-and-dois--release-bar.png
:label: versions:release-bar
:alt: The Release a new version? bar, with Save draft and Release new version buttons.
:align: center
:width: 75%

Click {gui}`Release new version…` when you are ready.
```

The version description is filled in as the release note.
Confirm that all byline authors have consented to the release, and click {gui}`Release new version`.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/stacks/versions-and-dois--release-dialog.png
:label: versions:release-dialog
:alt: The release dialog for a new version, with the consent checkbox ticked and the release note filled in.
:align: center
:width: 60%

Confirm that the byline authors consent, then release the new version.
```

The slug and license of a publication can't change after its first release, and neither can its concept DOI.
Releasing a new version makes its version DOI permanent.

## How DOIs work

If your organization has [DOI minting](xref:raven#admins:doi-minting) turned on, each publication gets two kinds of DOI:

- **Concept DOI**: one for the publication as a whole. Its metadata updates only when you publish a new version, not while you edit a draft.
- **Version DOI**: one per version, formed by adding `.N` to the concept DOI, like `10.82153/pff0-ck46.2`. Version DOIs are shown in the version dropdown.

DOIs are reserved as drafts while you work, and become public when you publish.
