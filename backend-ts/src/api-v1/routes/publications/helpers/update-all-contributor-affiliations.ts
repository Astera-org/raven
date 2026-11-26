import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type ContributorsUpdate } from "#v1/routes/publications/route-requests/patch-publication.js";
import { type ContributorResponse } from "#v1/routes/publications/route-responses/publication.js";

export async function updateAllContributorAffiliations(
  repos: Repositories,
  userId: string,
  versionId: string,
  newAffiliations: ContributorsUpdate[number]["affiliations"] | undefined,
  currentAffiliations: ContributorResponse["affiliations"] | undefined = []
): Promise<[boolean, ValidationIssue[]]> {
  if (newAffiliations === undefined || currentAffiliations === undefined) {
    return [false, []];
  }

  /**
   * Create maps and sets for easy lookup for finding affiliations to delete,
   * insert, and update.
   */
  const existingByKey = new Map(currentAffiliations.map((a) => [a.orgId, a]));
  const incomingKeys = new Set(newAffiliations);

  /**
   * Filter which to delete, insert, and update
   */
  const toDelete = currentAffiliations.filter(
    (a) => !incomingKeys.has(a.orgId)
  );
  // Built from the set so an org repeated in the list is inserted once,
  // matching the one row per (version, user, org) the database allows
  const toInsert = [...incomingKeys].filter((a) => !existingByKey.has(a));

  /**
   * Delete all affiliations that are not in the new list in a single statement.
   */
  if (toDelete.length) {
    await repos.contributors.deleteAffiliations(
      versionId,
      userId,
      toDelete.map((o) => o.orgId)
    );
  }

  const orgs = await repos.orgs.listById(toInsert);

  if (orgs.length !== toInsert.length) {
    const foundIds = orgs.map((o) => o.id);
    const missingOrgs = toInsert.filter((orgId) => !foundIds.includes(orgId));

    const issues = missingOrgs.map((orgId): ValidationIssue => ({
      code: "custom",
      input: orgId,
      message: "Org not found",
      path: [newAffiliations.findIndex((aff) => aff === orgId)],
    }));

    return [false, issues];
  }

  /**
   * Insert all org-pubs that are in the new list but not in the old
   * list.
   */
  if (toInsert.length) {
    await repos.contributors.createAffiliations(versionId, userId, toInsert);
  }
  return [true, []];
}
