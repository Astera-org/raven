import { type Publication, type Version } from "#src/db/schema.js";
import { dbDateToIso8601 } from "#src/lib/dates.js";
import { type ContributorRow } from "#v1/db-repositories/contributors-repository.js";
import { type VersionListItemRow } from "#v1/db-repositories/versions-repository.js";
import { buildGetPublicationResponse } from "#v1/routes/publications/helpers/build-get-publication-response.js";

/**
 * The admin view of a publication at `version`: the public response plus
 * contributor usernames, every listed version with its state, the
 * publication's comment count in every state, and its stored DOI metadata.
 * Shared by the detail, version and update routes so all return the same
 * shape.
 */
export async function buildAdminPublicationResponse(
  pub: Publication,
  version: Version,
  {
    versionRows,
    contributorRows,
    commentsCount,
  }: {
    versionRows: VersionListItemRow[];
    contributorRows: ContributorRow[];
    commentsCount: number;
  }
) {
  const publication = await buildGetPublicationResponse(pub, version, {
    versionRows,
    contributorRows,
  });
  return {
    ...publication,
    state: pub.state,
    contributors: contributorRows,
    commentsCount,
    doiMetadata: pub.doiMetadata,
    versions: versionRows.map(
      ({ currentImportId: _currentImportId, ...v }) => ({
        ...v,
        createdAt: dbDateToIso8601(v.createdAt),
      })
    ),
  };
}
