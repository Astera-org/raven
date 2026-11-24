import { type Publication, type VersionBibliography } from "#src/db/schema.js";
import { frontmatterHashInput } from "#src/lib/myst/frontmatter.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type MystFrontmatter } from "@raven/core-import-format";
import { createHash } from "node:crypto";

export interface DraftContent {
  title: string | null | undefined;
  subtitle: string | null | undefined;
  abstract: string | null | undefined;
  body: string | null | undefined;
  bibliography?: VersionBibliography | null | undefined;
  frontmatter?: MystFrontmatter | null | undefined;
}

export interface DraftEtagFields extends DraftContent {
  /** The publication's license code. */
  license: string | null | undefined;
  tags: string[];
}

/**
 * A strong ETag over everything a MyST `PUT` replaces unconditionally: the
 * draft's content fields (its `numbering` and `math` frontmatter among them),
 * its bibliography, the publication's license and its
 * tags (in any order). It's a hash rather than `versions.updated_at` because
 * v0's raw-SQL updates don't touch `updated_at`, so an edit made through any
 * API changes the ETag. The DOI is left out: a `PUT` never replaces one, and
 * publishing can mint one, which would otherwise invalidate the ETag from
 * before.
 *
 * A draft without a bibliography or that frontmatter hashes exactly what it
 * did before they were stored, so ETags stored by earlier CLI pushes still
 * match.
 */
export function draftEtag({
  title,
  subtitle,
  abstract,
  body,
  bibliography,
  frontmatter,
  license,
  tags,
}: DraftEtagFields): string {
  const files = bibliography?.files ?? [];
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        title ?? null,
        subtitle ?? null,
        abstract ?? null,
        body ?? null,
        license ?? null,
        [...new Set(tags)].sort(),
        ...(files.length
          ? [files.map(({ filename, content }) => [filename, content])]
          : []),
        ...frontmatterHashInput(frontmatter),
      ])
    )
    .digest("base64url");
  return `"${hash}"`;
}

/** The ETag of `draft` as the draft of `publication`, with its current tags. */
export async function loadDraftEtag(
  repos: Repositories,
  publication: Pick<Publication, "id" | "license">,
  draft: DraftContent
): Promise<string> {
  return draftEtag({
    ...draft,
    license: publication.license,
    tags: await repos.publications.listTags(publication.id),
  });
}

/**
 * Whether an `If-Match` header allows a write to a resource whose current
 * ETag is `etag`. `If-Match` uses strong comparison, so weak tags never match.
 */
export function ifMatchSatisfied(ifMatch: string, etag: string): boolean {
  return ifMatch
    .split(",")
    .map((tag) => tag.trim())
    .some((tag) => tag === "*" || tag === etag);
}
