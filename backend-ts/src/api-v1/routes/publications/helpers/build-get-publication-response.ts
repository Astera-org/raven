import { getConfig } from "#src/config.js";
import { type Publication, type Version } from "#src/db/schema.js";
import { dbDateToIso8601 } from "#src/lib/dates.js";
import { contentFormat } from "#src/lib/importers/document-formats.js";
import { type ContributorRow } from "#v1/db-repositories/contributors-repository.js";
import { makeRepositories, Repositories } from "#v1/db-repositories/index.js";
import { type VersionListItemRow } from "#v1/db-repositories/versions-repository.js";
import {
  type DraftPublicationResponse,
  type PublicationResponse,
  type VersionListItemResponse,
} from "#v1/routes/publications/route-responses/publication.js";
import {
  buildImportDocumentResponse,
  buildVersionImportDocumentResponse,
} from "./build-import-document-response.js";
import { generateDocumentStats } from "./generate-document-stats.js";
import { publicationBibliography } from "./publication-bibliography.js";

export async function buildDraftPublicationResponseFromIds(
  publicationId: string,
  versionId: string,
  options?: { getDraft: boolean }
): Promise<
  | {
      publication: DraftPublicationResponse;
      ownerId: string | null;
    }
  | {
      publication: undefined;
      ownerId?: never;
    }
> {
  const repos = new Repositories();
  const [pub, pubVersion] = await Promise.all([
    repos.publications.findById(publicationId),
    repos.versions.findById(versionId),
  ]);

  if (
    pub === undefined ||
    pubVersion === undefined ||
    pubVersion.publicationId !== publicationId
  ) {
    return {
      publication: undefined,
    };
  }

  const builtPublication = await buildGetPublicationResponse(
    pub,
    pubVersion,
    options
  );

  return {
    publication: {
      ...builtPublication,
      subjects: pub.doiMetadata.content.subjects,
    },
    ownerId: pub.ownerId,
  };
}

export async function buildGetPublicationResponse(
  publication: Publication,
  version: Version,
  {
    getDraft,
    versionRows: loadedVersionRows,
    contributorRows: loadedContributorRows,
  }: {
    getDraft?: boolean;
    versionRows?: VersionListItemRow[];
    contributorRows?: ContributorRow[];
  } = {}
): Promise<PublicationResponse> {
  const repos = makeRepositories();
  const [versionRows, currentImport] = await Promise.all([
    loadedVersionRows ?? repos.versions.list(publication.id),
    version.currentImportId
      ? repos.imports.findById(version.currentImportId)
      : null,
  ]);

  const importDocument = buildImportDocumentResponse(currentImport, {
    forDraft: Boolean(getDraft),
    editedFields: version.editedFields,
  });

  const format = contentFormat(version.importDocumentFormat);
  const content = format ? { format } : undefined;

  let socialPostsCount: number | null = null;
  const metadata = publication.metadata;
  if (metadata && typeof metadata === "string") {
    try {
      const m = JSON.parse(metadata) as { socialPostsCount?: number | null };
      socialPostsCount = m.socialPostsCount ?? null;
    } catch {
      /* ignore */
    }
  }

  const [
    contributorRows,
    linkedAssets,
    orgRows,
    tags,
    referenceRows,
    mediaAssets,
    listedImports,
  ] = await Promise.all([
    loadedContributorRows ?? repos.contributors.listByVersionId(version.id),
    repos.versions.listLinkedAssets(version.id),
    repos.publications.listOrgs(publication.id, true),
    repos.publications.listTags(publication.id),
    repos.versions.listReferences(version.id),
    repos.versions.listMediaAssets(version.id),
    // Only the draft lists each version's import, so the editor can show the
    // doc an earlier version was synced from when the draft has none.
    getDraft
      ? repos.imports.listSummariesByIds(
          versionRows.flatMap((r) => r.currentImportId ?? [])
        )
      : [],
  ]);

  const listedImportsById = new Map(listedImports.map((i) => [i.id, i]));
  const versionList = versionRows.map((r): VersionListItemResponse => ({
    id: r.id,
    versionNumber: r.versionNumber,
    versionDesc: r.versionDesc,
    doi: r.doi,
    createdAt: dbDateToIso8601(r.createdAt),
    importDocument: buildVersionImportDocumentResponse(
      r.currentImportId ? listedImportsById.get(r.currentImportId) : null
    ),
  }));

  const orgs = orgRows.map((o) => ({
    // Guaranteed non-null: `orgPublicationMap.orgId` is a NOT NULL FK to
    // `organizations.id`, and we asked listOrgs to join it in.
    orgId: o.orgId!,
    // Every org association is given an explicit priority on insert
    // (see updateAllOrgs); the column is nullable only because MySQL can't
    // express "not null, always app-assigned."
    priority: o.priority ?? 0,
    slug: o.organization!.slug,
    name: o.organization!.name,
    avatar: o.organization!.avatar,
  }));

  return {
    // Publication content
    id: publication.id,
    createdAt: dbDateToIso8601(publication.createdAt),
    doi: publication.doi,
    feedbackFormEmbedSrc: publication.feedbackFormEmbedSrc,
    license: publication.license,
    slug: publication.slug,
    socialPostsCount,
    socialPostsEmbedSrc: publication.socialPostsEmbedSrc,
    state: publication.state,

    // Version content
    abstract: version.abstract,
    body: version.body,
    importDocument,
    content,
    bibliography: publicationBibliography(version),
    pdfUrl: version.pdfUrl,
    subtitle: version.subtitle,
    title: version.title,
    versionDesc: version.versionDesc,
    versionDoi: version.doi,
    versionNumber: version.versionNumber,
    versionState: version.state,

    // Queried
    // Usernames are admin-only.
    contributors: contributorRows.map(({ username: _username, ...c }) => c),
    linkedAssets,
    orgs,
    references: referenceRows,
    stats: generateDocumentStats(
      version.body ?? "",
      version.abstract,
      referenceRows,
      version.importDocumentFormat,
      version
    ),
    tags,
    versions: versionList,
    mediaAssets: mediaAssets.items,

    // Static
    publisher: getConfig().DATACITE_PUBLISHER,
  };
}
