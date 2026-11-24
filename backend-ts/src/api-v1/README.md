# API v1

The REST API mounted at `/api/v1`. Its OpenAPI document is served at `/api/v1/openapi.json`, with interactive docs at `/api/v1/docs`. The conventions every route follows are in the `api-versioning` skill (`.agents/skills/api-versioning/SKILL.md`).

## Endpoint status

Every v1 operation is either **stable** or **alpha**:

- **Stable** operations are used by a deployed client, so they only change additively: new response fields, new optional request parameters, new enum values, new status codes for new situations. Removing or renaming a field, changing its type, making an optional request field required, removing an operation (even a deprecated one), or changing a status code is a breaking change, and CI rejects it (see [Compatibility check](#compatibility-check)).
- **Alpha** operations are still in development and can change in any way. Don't build a deployed client on them until they're stable.

The status is set on each route with `stability: "stable"` (the default is `"alpha"`) and published in the OpenAPI document as `x-stability-level`, which is what oasdiff reads.

The stable set is what The Stacks frontend calls on its `production` branch (`frontend/app/apiv1/` in thestacks.org), checked on 2026-11-18. Three stable operations are deprecated aliases that the frontend still calls. They stay until it moves to their replacements.

<!-- v1-endpoints:start -->

<!-- Generated from the routes' `stability` by `pnpm v1:contract --regenerate`; don't edit by hand. -->

### Stable (15)

| Method   | Path                                                     | Summary                                               |
| -------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `GET`    | `/api/v1/publications/drafts`                            | List the caller's own draft publications (deprecated) |
| `PATCH`  | `/api/v1/publications/id/{id}`                           | Patch a publication draft (deprecated)                |
| `GET`    | `/api/v1/publications/id/{id}/draft`                     | Get a publication's draft                             |
| `DELETE` | `/api/v1/publications/id/{id}/draft`                     | Delete a publication's draft                          |
| `POST`   | `/api/v1/publications/id/{id}/publish`                   | Publish a publication's draft (deprecated)            |
| `GET`    | `/api/v1/publications/id/{id}/candidate-orgs`            | Get orgs a publication could be associated with       |
| `GET`    | `/api/v1/publications/id/{id}/doi`                       | Get DOI metadata                                      |
| `PUT`    | `/api/v1/publications/id/{id}/doi`                       | Record an external DOI                                |
| `POST`   | `/api/v1/publications/id/{id}/doi`                       | Mint or update draft DOI metadata                     |
| `GET`    | `/api/v1/publications/id/{id}/doi/eligibility`           | Get DOI minting eligibility                           |
| `POST`   | `/api/v1/publications/p/{slug}/draft`                    | Create a new draft by slug                            |
| `GET`    | `/api/v1/publications/p/{slug}/versions/{versionNumber}` | Get a publication version by slug                     |
| `GET`    | `/api/v1/users`                                          | List or search users                                  |
| `POST`   | `/api/v1/imports`                                        | Import a publication                                  |
| `GET`    | `/api/v1/imports/{id}`                                   | Get import status                                     |

### Alpha (49)

| Method   | Path                                                             | Summary                                               |
| -------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| `GET`    | `/api/v1/orgs`                                                   | List organizations                                    |
| `POST`   | `/api/v1/orgs`                                                   | Create an organization                                |
| `GET`    | `/api/v1/orgs/{idOrSlug}`                                        | Get an organization                                   |
| `PATCH`  | `/api/v1/orgs/{idOrSlug}`                                        | Update an organization                                |
| `DELETE` | `/api/v1/orgs/{idOrSlug}`                                        | Delete an organization                                |
| `PUT`    | `/api/v1/orgs/{idOrSlug}/avatar`                                 | Replace an organization's avatar                      |
| `GET`    | `/api/v1/orgs/{idOrSlug}/members`                                | List an organization's members                        |
| `GET`    | `/api/v1/orgs/{idOrSlug}/publications`                           | List an organization's publications                   |
| `GET`    | `/api/v1/health`                                                 | Liveness check                                        |
| `GET`    | `/api/v1/publications`                                           | List published publications                           |
| `POST`   | `/api/v1/publications`                                           | Create a publication draft                            |
| `GET`    | `/api/v1/publications/id/{id}`                                   | Get a publication by ID                               |
| `DELETE` | `/api/v1/publications/id/{id}`                                   | Delete a publication                                  |
| `PATCH`  | `/api/v1/publications/id/{id}/draft`                             | Patch a publication's draft                           |
| `POST`   | `/api/v1/publications/id/{id}/draft`                             | Create a new draft by ID                              |
| `GET`    | `/api/v1/publications/id/{id}/draft/content`                     | Get the draft's MyST content                          |
| `PUT`    | `/api/v1/publications/id/{id}/draft/content`                     | Replace the draft's MyST content                      |
| `GET`    | `/api/v1/publications/id/{id}/draft/bibliography`                | Get the draft's bibliography                          |
| `PUT`    | `/api/v1/publications/id/{id}/draft/bibliography`                | Replace the draft's bibliography                      |
| `POST`   | `/api/v1/publications/id/{id}/draft/media-assets`                | Upload a file for the draft                           |
| `POST`   | `/api/v1/publications/id/{id}/versions`                          | Publish a publication's draft as a new version        |
| `GET`    | `/api/v1/publications/id/{id}/versions/{versionNumber}`          | Get a publication version by ID                       |
| `GET`    | `/api/v1/publications/p/{slug}`                                  | Get a publication by slug                             |
| `GET`    | `/api/v1/users/me`                                               | Get the current user                                  |
| `GET`    | `/api/v1/users/me/publications`                                  | List the caller's own publications                    |
| `POST`   | `/api/v1/admin/doi-audits`                                       | Start a DOI metadata audit                            |
| `GET`    | `/api/v1/admin/doi-audits/{jobId}`                               | Get a DOI metadata audit                              |
| `GET`    | `/api/v1/admin/doi-comparisons`                                  | Compare a DOI with its DataCite record                |
| `POST`   | `/api/v1/admin/doi-pushes`                                       | Push a DOI's differing fields to DataCite             |
| `GET`    | `/api/v1/admin/org-slug-availability`                            | Check whether an organization slug is available       |
| `GET`    | `/api/v1/admin/orgs`                                             | List organizations that one administers               |
| `POST`   | `/api/v1/admin/orgs`                                             | Create an organization                                |
| `GET`    | `/api/v1/admin/orgs/{idOrSlug}`                                  | Get an organization                                   |
| `PATCH`  | `/api/v1/admin/orgs/{idOrSlug}`                                  | Update an organization                                |
| `GET`    | `/api/v1/admin/orgs/{idOrSlug}/members`                          | List an organization's members                        |
| `POST`   | `/api/v1/admin/orgs/{idOrSlug}/members`                          | Add a member to an organization                       |
| `PATCH`  | `/api/v1/admin/orgs/{idOrSlug}/members/{memberId}`               | Update an organization's member                       |
| `DELETE` | `/api/v1/admin/orgs/{idOrSlug}/members/{memberId}`               | Remove a member from an organization                  |
| `GET`    | `/api/v1/admin/orgs/{idOrSlug}/publications`                     | List an organization's publications                   |
| `GET`    | `/api/v1/admin/publications`                                     | List publications the caller administers              |
| `GET`    | `/api/v1/admin/publications/{idOrSlug}`                          | Get a publication the caller administers              |
| `PATCH`  | `/api/v1/admin/publications/{idOrSlug}`                          | Update a publication the caller administers           |
| `GET`    | `/api/v1/admin/publications/{idOrSlug}/versions/{versionNumber}` | Get a version of a publication the caller administers |
| `GET`    | `/api/v1/admin/users`                                            | List users                                            |
| `GET`    | `/api/v1/admin/users/{id}`                                       | Get a user                                            |
| `PATCH`  | `/api/v1/admin/users/{id}`                                       | Update a user                                         |
| `GET`    | `/api/v1/admin/users/{id}/publications`                          | List a user's publications                            |
| `GET`    | `/api/v1/admin/users/{id}/comments`                              | List a user's comments                                |
| `GET`    | `/api/v1/admin/users/{id}/orgs`                                  | List a user's organizations                           |

<!-- v1-endpoints:end -->

## Making an endpoint stable

Make an operation stable before a deployed client (The Stacks, the `raven` CLI, a third party) starts using it:

1. Add `stability: "stable"` to its `createV1Route`/`createAuthedRoute`/`createAdminRoute` config. A deprecated alias that spreads another route is only stable when it sets this itself.
2. Run `pnpm -F @raven/backend-ts v1:contract --regenerate`. This regenerates the tables above and `openapi.stable.json`.
3. Commit both files with the route change.

## Compatibility check

`openapi.stable.json` is the OpenAPI document cut down to the stable operations and the components they use. It is generated, so don't edit it by hand.

A breaking change is either of:

- An operation that was stable is removed or no longer stable. oasdiff lets deprecated operations be removed, so `v1:contract` checks this itself.
- Anything [oasdiff](https://github.com/oasdiff/oasdiff) `breaking` rates a warning or an error. oasdiff rates removing an optional response field or an error status as info only, so `oasdiff-severity-levels.txt` raises those rules to warnings.

`pnpm -F @raven/backend-ts v1:contract` writes nothing. It compares the routes with the committed `openapi.stable.json` and this README, and reports one of: no API changes; breaking changes to stable operations; or that the API changed and the files need regenerating with `--regenerate`. `--base <file>` only checks for breaking changes against another `openapi.stable.json`, such as a base branch's. Both run oasdiff if it's installed (`brew install oasdiff`) and say so when it isn't.

The `V1 API compatibility` workflow (`.github/workflows/v1-api-compat.yml`) runs `v1:contract` on every pull request and push to `main`, then `v1:contract --base` with the pull request base commit's `openapi.stable.json`. In CI, a missing oasdiff is a failure.

A breaking change to a stable operation is a v2 conversation, not a v1 edit. When one is agreed on anyway (for example, removing a deprecated alias once no client calls it), add the `v1-breaking-change` label to the pull request to skip the `--base` check.
