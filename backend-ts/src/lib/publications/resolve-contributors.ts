import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import {
  DEFAULT_ROLE,
  toContributorRole,
} from "#v1/routes/publications/helpers/contributor-roles.js";
import { type ImportedContributor } from "@raven/core-import-format";
import { resolveOrgs } from "./resolve-orgs.js";

export interface ResolvedContributor {
  userId: string;
  roles: string[];
  inByline: boolean;
  /** Org IDs. */
  affiliations: string[];
}

/**
 * Finds the users `contributors` refer to, each by the first of their refs
 * that matches (users aren't found by name), and maps their roles to The
 * Stacks' roles, defaulting to `DEFAULT_ROLE`. Entries for the same
 * user are merged in first-seen order. Unknown users, roles and affiliations
 * are left out and reported at `[...path, index]`, as the document names
 * them (e.g. `["authors", 2]`).
 */
export async function resolveContributors(
  repos: Repositories,
  contributors: ImportedContributor[],
  path: (string | number)[]
): Promise<{ contributors: ResolvedContributor[]; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = [];
  const byUser = new Map<string, ResolvedContributor>();
  for (const [index, contributor] of contributors.entries()) {
    const userId = await findUserId(repos, contributor);
    if (!userId) {
      issues.push({
        code: "custom",
        path: [...path, index],
        message: notFoundMessage(contributor),
      });
      continue;
    }
    const roles = mapRoles(contributor, [...path, index], issues);
    const { orgIds: affiliations, issues: affiliationIssues } =
      await resolveOrgs(repos, contributor.affiliations, {
        path: [...path, index, "affiliations"],
        skip: true,
      });
    issues.push(...affiliationIssues);

    const existing = byUser.get(userId);
    if (!existing) {
      byUser.set(userId, {
        userId,
        roles,
        inByline: contributor.inByline,
        affiliations,
      });
      continue;
    }
    existing.roles = [...new Set([...existing.roles, ...roles])];
    existing.inByline ||= contributor.inByline;
    existing.affiliations = [
      ...new Set([...existing.affiliations, ...affiliations]),
    ];
  }
  return { contributors: [...byUser.values()], issues };
}

async function findUserId(
  repos: Repositories,
  contributor: ImportedContributor
): Promise<string | undefined> {
  for (const ref of contributor.user) {
    const found =
      ref.by === "orcid"
        ? await repos.users.findByOrcid(ref.value)
        : ref.by === "email"
          ? await repos.users.findByEmail(ref.value)
          : undefined;
    if (found) return found.id;
  }
  return undefined;
}

function mapRoles(
  contributor: ImportedContributor,
  path: (string | number)[],
  issues: ValidationIssue[]
): string[] {
  const roles: string[] = [];
  for (const [roleIndex, role] of contributor.roles.entries()) {
    const mapped = toContributorRole(role);
    if (mapped) {
      if (!roles.includes(mapped)) roles.push(mapped);
      continue;
    }
    issues.push({
      code: "custom",
      path: [...path, "roles", roleIndex],
      message: `"${role}" isn't a contributor role on The Stacks; left out`,
    });
  }
  return roles.length > 0 ? roles : [DEFAULT_ROLE];
}

function notFoundMessage(contributor: ImportedContributor): string {
  const refs = contributor.user;
  const who = `"${contributor.displayName ?? refs[0]?.value ?? "unnamed"}"`;
  const ids = refs.flatMap((ref) =>
    ref.by === "orcid"
      ? [`the ORCID iD ${ref.value}`]
      : ref.by === "email"
        ? [`the email ${ref.value}`]
        : []
  );
  if (ids.length === 0) {
    return `Author ${who} has no ORCID iD or email to find them by; skipped`;
  }
  return `No user has ${ids.join(" or ")} of author ${who}; skipped`;
}
