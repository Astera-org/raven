import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type OrgRef } from "@raven/core-import-format";

/** An org named by a client (`id`, `slug`) or by an imported document. */
export type OrgLookup = OrgRef | { by: "id" | "slug"; value: string };

/**
 * Finds the orgs `lookups` name, in the same order, keeping only the first
 * entry for an org named more than once. Unknown or deleted orgs are
 * reported at `[...path, index]`: as `Org not found`, or with `skip` as
 * skipped, for callers that go on without them. Orgs aren't looked up by
 * name yet, so those are never found.
 */
export async function resolveOrgs(
  repos: Repositories,
  lookups: OrgLookup[],
  { path, skip = false }: { path: (string | number)[]; skip?: boolean }
): Promise<{ orgIds: string[]; issues: ValidationIssue[] }> {
  const valuesBy = (by: OrgLookup["by"]) =>
    lookups.flatMap((lookup) => (lookup.by === by ? [lookup.value] : []));
  const ids = valuesBy("id");
  const [byId, bySlug] = await Promise.all([
    ids.length > 0 ? repos.orgs.listById(ids) : [],
    repos.orgs.listBySlug(valuesBy("slug")),
  ]);
  const knownIds = new Set(byId.map((org) => org.id));
  const idsBySlug = new Map(bySlug.map((org) => [org.slug, org.id]));

  const orgIds: string[] = [];
  const issues: ValidationIssue[] = [];
  for (const [index, lookup] of lookups.entries()) {
    const orgId = await findOrgId(repos, lookup, knownIds, idsBySlug);
    if (orgId) {
      if (!orgIds.includes(orgId)) orgIds.push(orgId);
      continue;
    }
    issues.push({
      code: "custom",
      input: lookup.value,
      message: skip
        ? `Org with ${lookup.by} "${lookup.value}" not found; skipped`
        : "Org not found",
      path: [...path, index],
    });
  }
  return { orgIds, issues };
}

async function findOrgId(
  repos: Repositories,
  lookup: OrgLookup,
  knownIds: Set<string>,
  idsBySlug: Map<string, string>
): Promise<string | undefined> {
  switch (lookup.by) {
    case "id":
      return knownIds.has(lookup.value) ? lookup.value : undefined;
    case "slug":
      return idsBySlug.get(lookup.value);
    case "rorId":
      return (await repos.orgs.findOrgByRorId(lookup.value))?.id;
    case "name":
      return undefined;
  }
}
