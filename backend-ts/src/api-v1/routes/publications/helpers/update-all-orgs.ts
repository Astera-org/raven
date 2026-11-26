import { ValidationIssuesException } from "#src/lib/errors/validation-issues-exception.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import {
  type OrgLookup,
  resolveOrgs,
} from "#src/lib/publications/resolve-orgs.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { type OrgsUpdate } from "#v1/routes/publications/route-requests/patch-publication.js";

/** `orgs` entries, each an `orgId` or an `orgSlug`, as org lookups. */
export function orgLookups(orgs: OrgsUpdate): OrgLookup[] {
  return orgs.map((org) =>
    org.orgId
      ? { by: "id", value: org.orgId }
      : { by: "slug", value: org.orgSlug ?? "" }
  );
}

export async function updateAllOrgs(
  publicationId: string,
  newOrgs: OrgsUpdate | undefined
): Promise<[boolean, ValidationIssue[]]> {
  if (newOrgs === undefined) {
    return [false, []];
  }
  const resolved = await resolveOrgs(makeRepositories(), orgLookups(newOrgs), {
    path: ["orgs"],
  });
  if (resolved.issues.length > 0) {
    return [false, resolved.issues];
  }
  // An org repeated in the list collapses to its first occurrence, since the
  // database allows one row per (org, publication)
  const newOrgsWithPriority = [...new Set(resolved.orgIds)].map((orgId, i) => ({
    orgId,
    priority: i + 1,
  }));

  try {
    /**
     * Wrap the entire operation in a transaction so that if any part fails, the
     * entire operation is rolled back.
     */
    const issues = await makeRepositories().transaction(
      async (repos): Promise<ValidationIssue[] | null> => {
        const currentOrgs = await repos.publications.listOrgs(
          publicationId,
          false
        );

        /**
         * Create maps and sets for easy lookup for finding orgs to delete,
         * insert, and update.
         */
        const existingByKey = new Map(currentOrgs.map((o) => [o.orgId, o]));
        const incomingKeys = new Set(newOrgsWithPriority.map((o) => o.orgId));

        /**
         * Filter which to delete, insert, and update
         */
        const toDelete = currentOrgs.filter((o) => !incomingKeys.has(o.orgId));
        const toInsert = newOrgsWithPriority.filter(
          (o) => !existingByKey.has(o.orgId)
        );
        const toUpdate = newOrgsWithPriority.filter((o) => {
          const found = existingByKey.get(o.orgId);
          return found && found.priority !== o.priority;
        });

        /**
         * Delete all pub-orgs that are not in the new list in a single statement.
         */
        if (toDelete.length) {
          await repos.publications.deleteOrgs(
            publicationId,
            toDelete.map((o) => o.orgId)
          );
        }

        /**
         * Update all org-pubs that are in the new list but have different
         * in_byline or priority values.
         *
         * These are the only two fields that are not part of the unique key, so
         * they are the only fieldsd that can be updated.
         */
        for (const updateOrg of toUpdate) {
          await repos.publications.updateOrgPriority(
            publicationId,
            updateOrg.orgId,
            updateOrg.priority
          );
        }

        const orgs = await repos.orgs.listById(toInsert.map((o) => o.orgId));

        if (orgs.length !== toInsert.length) {
          const foundIds = orgs.map((o) => o.id);
          const missingOrgs = toInsert.filter(
            ({ orgId }) => !foundIds.includes(orgId)
          );

          const issues = missingOrgs.map(({ orgId }): ValidationIssue => ({
            code: "custom",
            input: orgId,
            message: "Org not found",
            path: ["orgs", resolved.orgIds.indexOf(orgId)],
          }));

          throw new ValidationIssuesException(issues);
        }

        /**
         * Insert all org-pubs that are in the new list but not in the old
         * list.
         */
        if (toInsert.length) {
          await repos.publications.createOrgs(publicationId, toInsert);
        }
        return null;
      }
    );

    if (issues === null || issues.length === 0) {
      return [true, []];
    }
    return [false, issues];
  } catch (error) {
    if (error instanceof ValidationIssuesException) {
      return [false, error.validationIssues];
    }
    throw error;
  }
}
