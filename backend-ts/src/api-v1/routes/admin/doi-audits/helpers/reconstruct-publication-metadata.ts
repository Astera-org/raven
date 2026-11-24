import { DoiMetadataSchema, type Publication } from "#src/db/schema.js";
import {
  buildCanonicalDates,
  buildCreatorsMetadata,
  fetchAllCreators,
  fetchAllReferences,
  fetchAllSupplements,
  fetchCreators,
  fetchReferences,
  fetchSupplements,
  type CanonicalMetadata,
  type UpdateDraftCanonicalMetadata,
  type VersionMetadata,
  type VersionMetadataBase,
} from "#src/lib/datacite/client.js";
import { DEFAULT_LICENSE } from "#src/lib/utils/licenses.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type DoiAuditPublicationRow } from "#v1/db-repositories/publications-repository.js";
import { type DoiComparisonType } from "#v1/routes/admin/doi-audits/route-requests/get-doi-comparison.js";

export interface ReconstructedPublicationMetadata {
  publicationId: Publication["id"];
  slug: string;
  canonicalDoi: string;
  // Null when the latest published version has no DOI of its own yet.
  versionDoi: string | null;
  versionNumber: number;
  canonicalMeta: CanonicalMetadata | UpdateDraftCanonicalMetadata;
  versionMeta: VersionMetadata;
}

const NO_CREATOR_ROWS: Awaited<ReturnType<typeof fetchCreators>> = [];
const NO_URLS: Array<{ url: string }> = [];
const NO_SUPPLEMENTS: Array<{ type: string; url: string; name: string }> = [];

/**
 * Rebuilds the DataCite metadata The Stacks would send for a publication's
 * latest published version and its canonical DOI, using the publication row
 * its caller already loaded and reading its published versions through the
 * repositories by string id.
 */
export async function reconstructPublicationMetadata(
  repos: Repositories,
  publication: DoiAuditPublicationRow,
  // Pass to skip fetching the unused side's creators/references/supplements.
  // Omit to fetch both, as the audit job does.
  { comparisonType }: { comparisonType?: DoiComparisonType } = {}
): Promise<ReconstructedPublicationMetadata | null> {
  const needCanonicalRefs = comparisonType !== "version";
  const needVersionRefs = comparisonType !== "canonical";

  if (!publication.doi) return null;
  const canonicalDoi = publication.doi;

  const allPublished = await repos.versions.listPublished(publication.id);

  const latest = allPublished.at(-1);
  if (!latest) return null;

  const [
    creatorRows,
    references,
    supplements,
    allCreatorRows,
    allReferences,
    allSupplements,
  ] = await Promise.all([
    needVersionRefs
      ? fetchCreators(repos, publication.id, latest.id)
      : Promise.resolve(NO_CREATOR_ROWS),
    needVersionRefs
      ? fetchReferences(repos, latest.id)
      : Promise.resolve(NO_URLS),
    needVersionRefs
      ? fetchSupplements(repos, latest.id)
      : Promise.resolve(NO_SUPPLEMENTS),
    needCanonicalRefs
      ? fetchAllCreators(repos, publication.id)
      : Promise.resolve(NO_CREATOR_ROWS),
    needCanonicalRefs
      ? fetchAllReferences(repos, publication.id)
      : Promise.resolve(NO_URLS),
    needCanonicalRefs
      ? fetchAllSupplements(repos, publication.id)
      : Promise.resolve(NO_SUPPLEMENTS),
  ]);
  const [creators, contributors] = buildCreatorsMetadata(creatorRows);
  const [allCreators, allContributors] = buildCreatorsMetadata(allCreatorRows);

  const publishDate = latest.createdAt.slice(0, 10);
  const year = parseInt(publishDate.slice(0, 4), 10);

  const dates = buildCanonicalDates(allPublished, publishDate);
  // filter().at(-1) rather than findLast(), which needs ES2023: admin-ui
  // typechecks this file through the hono client's AppType, and its lib is
  // ES2022.
  const previousVersionDoi =
    allPublished
      .filter(
        (version) => version.versionNumber < latest.versionNumber && version.doi
      )
      .at(-1)?.doi ?? null;

  const versionDois = allPublished.flatMap((version) =>
    version.doi ? [version.doi] : []
  );

  const versionMetaBase: VersionMetadataBase = {
    abstract: latest.abstract ?? "",
    title: latest.title ?? "",
    subtitle: latest.subtitle ?? "",
    license: publication.license ?? DEFAULT_LICENSE,
    creators,
    contributors,
    doiMetadata: DoiMetadataSchema.parse(publication.doiMetadata),
    publicationYear: year,
    slug: publication.slug,
    references,
    supplements,
    publishDate,
  };
  const versionMeta: VersionMetadata =
    latest.versionNumber === 1
      ? {
          ...versionMetaBase,
          versionDesc: latest.versionDesc,
          previousVersionDoi: null,
          canonicalDoi,
          versionNumber: 1,
        }
      : {
          ...versionMetaBase,
          versionDesc: latest.versionDesc ?? "",
          previousVersionDoi,
          canonicalDoi,
          versionNumber: latest.versionNumber,
        };

  const canonicalMeta: CanonicalMetadata | UpdateDraftCanonicalMetadata = {
    creators: allCreators,
    contributors: allContributors,
    references: allReferences,
    supplements: allSupplements,
    versionDois,
    dates,
  };

  return {
    publicationId: publication.id,
    slug: publication.slug,
    canonicalDoi,
    versionDoi: latest.doi,
    versionNumber: latest.versionNumber,
    canonicalMeta,
    versionMeta,
  };
}
