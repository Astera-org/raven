import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { resolveContributors } from "#src/lib/publications/resolve-contributors.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type ImportedContributor } from "@raven/core-import-format";
import { updateAllContributors } from "./update-all-contributors.js";

/**
 * Adds the imported contributors that aren't contributors yet to the end of
 * the byline, keeping those already on the publication as they are. Returns
 * warnings for the contributors, roles and affiliations that were left out,
 * at `[...path, index]`.
 */
export async function addContributors(
  versionId: string,
  imported: ImportedContributor[],
  path: (string | number)[],
  repos: Repositories
): Promise<ValidationIssue[]> {
  if (imported.length === 0) return [];

  const { contributors: resolved, issues } = await resolveContributors(
    repos,
    imported,
    path
  );
  const current = await repos.contributors.listByVersionId(versionId);
  const currentIds = new Set(current.map((contributor) => contributor.userId));
  const added = resolved.filter(
    (contributor) => !currentIds.has(contributor.userId)
  );
  if (added.length === 0) return issues;

  const contributors = [
    ...[...current]
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((contributor) => ({
        userId: contributor.userId,
        roles: contributor.roles,
        inByline: contributor.inByline ?? false,
        affiliations: contributor.affiliations.map(
          (affiliation) => affiliation.orgId
        ),
      })),
    ...added,
  ];
  const [, contributorIssues] = await updateAllContributors(
    versionId,
    contributors,
    repos
  );
  return [...issues, ...contributorIssues];
}
