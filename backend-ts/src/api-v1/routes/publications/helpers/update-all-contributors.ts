import { ValidationIssuesException } from "#src/lib/errors/validation-issues-exception.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import {
  type ContributorUpdateItem,
  type ContributorsUpdate,
} from "#v1/routes/publications/route-requests/patch-publication.js";
import { isDeepStrictEqual } from "node:util";
import { updateAllContributorAffiliations } from "./update-all-contributor-affiliations.js";

type DedupedContributor = ContributorUpdateItem & { priority: number };

// Merged entries lose their request position, so an affiliation issue points
// at the first entry for the user that lists the org
function affiliationIssuePath(
  contributors: ContributorsUpdate,
  userId: string,
  orgId: string
): ValidationIssue["path"] {
  const index = contributors.findIndex(
    (c) => c.userId === userId && c.affiliations.some((a) => a === orgId)
  );
  return [
    "contributors",
    index,
    "affiliations",
    contributors[index]?.affiliations.findIndex((a) => a === orgId) ?? null,
  ];
}

/**
 * The table holds one row per (version, user), so repeated entries for a user
 * merge into their first position, and `priority` renumbers from the order
 * those first positions appear in.
 */
function dedupeContributors(
  contributors: ContributorsUpdate
): DedupedContributor[] {
  const merged = new Map<string, ContributorUpdateItem>();
  for (const contributor of contributors) {
    const existing = merged.get(contributor.userId);
    if (!existing) {
      merged.set(contributor.userId, {
        ...contributor,
        roles: [...new Set(contributor.roles)],
        affiliations: [...new Set(contributor.affiliations)],
      });
      continue;
    }
    merged.set(contributor.userId, {
      ...existing,
      inByline: existing.inByline || contributor.inByline,
      roles: [...new Set([...existing.roles, ...contributor.roles])],
      affiliations: [
        ...new Set([...existing.affiliations, ...contributor.affiliations]),
      ],
    });
  }
  return [...merged.values()].map((contributor, index) => ({
    ...contributor,
    priority: index + 1,
  }));
}

export async function updateAllContributors(
  versionId: string,
  newContributors: ContributorsUpdate | undefined,
  repositories: Repositories
): Promise<[boolean, ValidationIssue[]]> {
  if (newContributors === undefined) {
    return [false, []];
  }

  const incoming = dedupeContributors(newContributors);

  try {
    /**
     * Wrap the entire operation in a transaction so that if any part fails, the
     * entire operation is rolled back. This is important because we don't want to
     * end up in a state where some contributors are updated and others are not.
     */
    const issues = await repositories.transaction(
      async (repos): Promise<ValidationIssue[] | null> => {
        // Publishing locks the same row, so the version can't be published
        // while its contributors are being written.
        const version = await repos.versions.findForUpdate(versionId);
        if (version?.state !== "DRAFT") {
          return [
            {
              code: "custom",
              path: ["contributors"],
              message:
                "The draft was published before its contributors could be saved",
            },
          ];
        }

        const currentContributors =
          await repos.contributors.listByVersionId(versionId);

        /**
         * Create maps and sets for easy lookup for finding contributors to
         * delete, insert, and update.
         */
        const existingByUserId = new Map(
          currentContributors.map((c) => [c.userId, c])
        );
        const incomingUserIds = new Set(incoming.map((c) => c.userId));

        /**
         * Filter which to delete, insert, and update. An entry whose roles are
         * all gone is no longer a contributor, so it is a delete rather than an
         * update.
         */
        const changed = incoming.filter((c) => {
          const found = existingByUserId.get(c.userId);
          return (
            found &&
            (found.priority !== c.priority ||
              found.inByline !== c.inByline ||
              !isDeepStrictEqual(found.roles, c.roles))
          );
        });
        const toInsert = incoming.filter(
          (c) => !existingByUserId.has(c.userId) && c.roles.length > 0
        );
        const toUpdate = changed.filter((c) => c.roles.length > 0);
        const toDelete = [
          ...currentContributors.filter((c) => !incomingUserIds.has(c.userId)),
          ...changed.filter((c) => c.roles.length === 0),
        ];

        /**
         * Delete all contributors that are not in the new list in a single
         * statement.
         */
        if (toDelete.length) {
          await repos.contributors.deleteManyFromVersion(
            versionId,
            toDelete.map((c) => c.userId)
          );
        }

        for (const updateContrib of toUpdate) {
          await repos.contributors.updateOnVersion(
            versionId,
            updateContrib.userId,
            {
              roles: updateContrib.roles,
              inByline: updateContrib.inByline,
              priority: updateContrib.priority,
            }
          );
        }

        const insertUserIds = toInsert.map((c) => c.userId);
        const users = await repos.users.listById(insertUserIds);

        // Check DB users against list with unique user IDs
        if (users.length !== insertUserIds.length) {
          const foundIds = users.map((u) => u.id);
          const missingUserIds = insertUserIds.filter(
            (userId) => !foundIds.includes(userId)
          );

          const issues = missingUserIds.map((userId): ValidationIssue => ({
            code: "custom",
            input: userId,
            message: "User not found",
            path: [
              "contributors",
              newContributors.findIndex((contrib) => contrib.userId === userId),
            ],
          }));

          if (issues.length) {
            throw new ValidationIssuesException(issues);
          }
        }

        /**
         * Insert all contributors that are in the new list but not in the old
         * list.
         */
        if (toInsert.length) {
          await repos.contributors.createMany(
            versionId,
            toInsert.map((c) => ({
              userId: c.userId,
              roles: c.roles,
              priority: c.priority,
              inByline: c.inByline,
            }))
          );
        }

        // Only a user left with a role is a contributor, so only their entries
        // keep affiliations.
        const affiliationsByUser = new Map(
          incoming
            .filter((c) => c.roles.length > 0)
            .map((c) => [c.userId, c.affiliations])
        );

        // Removing a role (here or in v0) never deleted affiliation rows, and
        // listByVersionId only sees users with roles, so any user other than
        // a continuing contributor can have rows nothing else would clear
        const currentUserIds = new Set(
          currentContributors.map((c) => c.userId)
        );
        const touchedUserIds = new Set([...currentUserIds, ...incomingUserIds]);
        await repos.contributors.deleteAllAffiliations(
          versionId,
          [...touchedUserIds].filter(
            (id) => !(currentUserIds.has(id) && affiliationsByUser.has(id))
          )
        );

        for (const [userId, affiliations] of affiliationsByUser) {
          const [success, issues] = await updateAllContributorAffiliations(
            repos,
            userId,
            versionId,
            affiliations,
            currentContributors.find((cur) => cur.userId === userId)
              ?.affiliations
          );
          if (!success && issues.length) {
            throw new ValidationIssuesException(
              issues.map((issue) => ({
                ...issue,
                path: affiliationIssuePath(
                  newContributors,
                  userId,
                  String(issue.input)
                ),
              }))
            );
          }
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
