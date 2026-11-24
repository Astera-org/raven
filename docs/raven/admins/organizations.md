---
description: Add organizations and members, and turn on DOI minting.
---

# Organizations

(admins:organization)=
An organization is an institution, like a lab or a university, that authors belong to.
Authors can only list an organization as an affiliation if it exists in Raven and they're a member of it.

Each organization gets an RSS feed of its publications at an endpoint like:

```
<your-api>/api/publications/rss/<organization>
```

Where `<organization>` is the organization's name with hyphens for spaces.

For example, The Stacks deployment serves [Arcadia Science's feed](https://api.thestacks.org/api/publications/rss/arcadia-science) and documents it for readers in [](xref:thestacks/api/formats).

Feed items link to `thestacks.org` by default, not to your deployment's `BASE_URL_WEB` ([backend settings](../deployers/configuration.md#backend-settings)).
To link them to your own site, add `?domain=<your-site>` to the feed URL.

## Add an organization

1. In the [admin UI](#admins:admin-ui), go to {gui}`Organizations` and click {gui}`New organization` ([site admins](#admins:roles) only).
2. Look up the organization on [ror.org](https://ror.org). If it has a ROR ID, put it in the ROR field.
3. Open the organization and click {gui}`Add member` for each author who needs this affiliation.

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/raven/organizations--new-organization.png
:label: organizations:new-organization
:width: 40%
:alt: The New organization panel, with Name, Slug, Profile, ROR and DOI Suffix Prefix fields and a DOI Minting toggle.
:align: center

The {gui}`New organization` panel. Put the ROR ID in the {gui}`ROR` field.
```

```{figure} https://thestacks-public.s3.us-west-2.amazonaws.com/docs-images/raven/organizations--organization-page.png
:label: organizations:organization-page
:width: 75%
:alt: The Example Lab organization page, showing its settings, member and publication counts, and a members table with an Add member button.
:align: center

An organization's page lists its members. Click {gui}`Add member` to add one.
```

## Turn on DOI minting

(admins:doi-minting)=
DOI minting registers a DOI with [DataCite](https://datacite.org) for each of an organization's publications.
Organization admins and site admins can turn it on with {gui}`DOI Minting` in the organization's settings.
