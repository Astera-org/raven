/** The seeded content every screenshot relies on. See shots/seed.setup.ts. */

export const HOST_ORG = { name: "Example Lab", slug: "example-lab" };

// Creating publications requires membership in one of the backend's
// PUBLICATION_CREATOR_ORGS. docker-compose.yml seeds this one.
export const CREATOR_ORG = { name: "Radial", slug: "radial" };

/** Released. Used by the reader and version shots. */
export const PUBLICATION_SLUG = "docs-example";

/** Filled in but never released. Used by the shots of the creation flow. */
export const DRAFT_SLUG = "docs-example-draft";

/**
 * Released. Used only by the comment shots, which add a comment on every run,
 * so the comment count on the other publications stays fixed.
 */
export const COMMENTS_SLUG = "docs-example-comments";

/** The test user's display name, set by TEST_USER_FIRST_NAME/LAST_NAME in docker-compose.yml. */
export const USER_DISPLAY_NAME = "Ada Example";

export const CONTRIBUTOR_ROLE = "Conceptualization";

export const PUB_TYPE_TAG = "Result";

export const PUBTEMPLATE_URL =
  "https://docs.google.com/document/d/1f1pNvIOJ7necaCLHxc6WR2hNkRWqFkIia1hGTOyuU-w/edit";

/** ORCID's own fictitious test iD (Josiah Carberry), shown as Ada's linked iD. */
export const EXAMPLE_ORCID = "0000-0002-1825-0097";
