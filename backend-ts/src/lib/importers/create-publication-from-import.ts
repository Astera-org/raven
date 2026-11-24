import { LICENSES } from "#src/db/schema.js";
import { createVersionImport } from "#src/lib/importers/create-version-import.js";
import { attachDiagnosticExcerpts } from "#src/lib/importers/helpers/attach-diagnostic-excerpts.js";
import { finishImport } from "#src/lib/importers/helpers/finish-import.js";
import { createMediaImportEntries } from "#src/lib/media/create-media-import-entries.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { resolveContributors } from "#src/lib/publications/resolve-contributors.js";
import { resolveOrgs } from "#src/lib/publications/resolve-orgs.js";
import { generateSlug } from "#src/lib/utils/generate-slug.js";
import { DEFAULT_LICENSE } from "#src/lib/utils/licenses.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { findAvailableSlug } from "#v1/routes/publications/helpers/find-available-slug.js";
import {
  IMPORT_LICENSES,
  type ImportedPublication,
} from "@raven/core-import-format";
import { ulid } from "ulid";
import { convertDiagnosticIssues } from "./helpers/convert-diagnostic-issues.js";

// The import format and the db enum are declared separately; keep them equal.
IMPORT_LICENSES satisfies readonly (typeof LICENSES)[number][];
LICENSES satisfies readonly (typeof IMPORT_LICENSES)[number][];

/**
 * Creates a draft publication and its first version from an importer's
 * result. People and orgs that can't be resolved are skipped and reported as
 * issues rather than failing the import.
 */
export async function createPublicationFromImport({
  imported,
  ownerId,
}: {
  imported: ImportedPublication;
  ownerId: string;
}): Promise<{
  publicationId: string;
  versionId: string;
  importId: string;
  slug: string;
  /** False while queued media uploads can still change the draft body. */
  settled: boolean;
  issues: ValidationIssue[];
}> {
  const { publication, version, importDocument, diagnostics } = imported;
  const repos = new Repositories();
  const issues = convertDiagnosticIssues(diagnostics);

  const publicationId = ulid();
  const versionId = ulid();
  const importId = ulid();
  const slug = await availableSlug(
    publication.slug ??
      (version.title && generateSlug(version.title, publicationId)) ??
      publicationId,
    repos
  );

  const { orgIds, issues: orgIssues } = await resolveOrgs(
    repos,
    publication.orgs,
    { path: ["orgs"], skip: true }
  );
  const { contributors, issues: contributorIssues } = await resolveContributors(
    repos,
    imported.contributors,
    ["contributors"]
  );
  issues.push(...orgIssues, ...contributorIssues);

  const { batchId, bossCommand } = await repos.transaction(async (repos) => {
    await repos.publications.create({
      id: publicationId,
      slug,
      ownerId,
      ownerIdInt: null,
      doi: publication.doi,
      license: publication.license ?? DEFAULT_LICENSE,
      metadata: publication.metadata,
      feedbackFormEmbedSrc: publication.feedbackFormEmbedSrc,
      socialPostsEmbedSrc: publication.socialPostsEmbedSrc,
    });
    await repos.versions.create({
      id: versionId,
      publicationId,
      publicationIdInt: null,
      title: version.title?.slice(0, 255) ?? null,
      subtitle: version.subtitle?.slice(0, 300),
      abstract: version.abstract,
      body: version.body,
      frontmatter: version.frontmatter,
      versionDesc: version.versionDesc,
      doi: version.doi,
      importDocumentBody: importDocument?.body ?? null,
      importDocumentUrl: importDocument?.url ?? null,
      importDocumentFilename: importDocument?.filename ?? null,
      importDocumentFormat: importDocument?.format ?? null,
      importDocumentSyncDate: importDocument ? new Date() : null,
    });
    await createVersionImport(repos, {
      id: importId,
      versionId,
      format: importDocument.format,
      url: importDocument.url,
      filename: importDocument.filename,
      body: importDocument.body,
      diagnostics: attachDiagnosticExcerpts(diagnostics, version),
    });

    await repos.publications.createManyTags(publicationId, [
      ...new Set(publication.tags),
    ]);
    await repos.publications.createOrgs(
      publicationId,
      orgIds.map((orgId, i) => ({ orgId, priority: i + 1 }))
    );

    await repos.contributors.createMany(
      versionId,
      contributors.map((c, i) => ({
        userId: c.userId,
        roles: c.roles,
        priority: i + 1,
        inByline: c.inByline,
      }))
    );
    for (const c of contributors) {
      await repos.contributors.createAffiliations(
        versionId,
        c.userId,
        c.affiliations
      );
    }

    await repos.versions.createLinkedAssets(
      versionId,
      uniqueBy(imported.linkedAssets, (a) => `${a.type}\u0000${a.url}`)
    );

    return createMediaImportEntries({
      media: imported.media,
      publicationId,
      versionId,
      importId,
      repos,
    });
  });

  const { settled } = await finishImport({
    batchId,
    bossCommand,
    publicationId,
    versionId,
  });

  return { publicationId, versionId, importId, slug, settled, issues };
}

async function availableSlug(slug: string, repos: Repositories) {
  const lower = slug.toLowerCase();
  return (await repos.publications.findBySlug(lower))
    ? await findAvailableSlug(lower, "")
    : lower;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
