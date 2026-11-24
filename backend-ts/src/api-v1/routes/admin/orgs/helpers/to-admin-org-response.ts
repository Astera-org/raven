import { type Organization } from "#src/db/schema.js";
import { dateToIso8601 } from "#src/lib/dates.js";
import { type AdminOrgCounts } from "#v1/db-repositories/orgs-repository.js";

export function toAdminOrgResponse(
  org: Omit<Organization, "idInt">,
  { canEditOrg, counts }: { canEditOrg: boolean; counts: AdminOrgCounts }
) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    avatar: org.avatar ?? null,
    profile: org.profile ?? null,
    rorId: org.rorId ?? null,
    unlisted: org.unlisted ?? null,
    createdAt: dateToIso8601(org.createdAt),
    updatedAt: dateToIso8601(org.updatedAt),
    ...counts,
    doiMintingEnabled: org.doiMintingEnabled,
    doiPrefix: org.doiPrefix ?? null,
    canEdit: canEditOrg,
  };
}
