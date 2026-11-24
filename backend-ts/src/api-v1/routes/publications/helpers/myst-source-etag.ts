import { type Publication, type VersionBibliography } from "#src/db/schema.js";
import { runMystmdImport } from "#src/lib/importers/run-mystmd-import.js";
import { draftEtag } from "./draft-etag.js";

/**
 * The ETag a draft has right after a MyST create or `PUT` stores `source`,
 * or null if `source` no longer parses. When it equals the draft's current
 * ETag, the stored source still describes the draft. A `PUT` leaves the
 * license alone when the source has none or the publication is published,
 * so the publication's license stands in then.
 *
 * The bibliography is its own resource, not part of `source`, so the draft's
 * stored files are passed in and hashed as they are.
 */
export function mystSourceEtag(
  source: string,
  publication: Pick<Publication, "license" | "state">,
  bibliography: VersionBibliography | null | undefined
): string | null {
  const myst = runMystmdImport(source);
  if (myst.status === "invalid") return null;
  const { publication: fields, version } = myst.imported;
  return draftEtag({
    title: version.title,
    subtitle: version.subtitle,
    abstract: version.abstract,
    body: version.body,
    frontmatter: version.frontmatter,
    bibliography,
    license:
      fields.license && publication.state !== "PUBLISHED"
        ? fields.license
        : publication.license,
    tags: fields.tags,
  });
}
