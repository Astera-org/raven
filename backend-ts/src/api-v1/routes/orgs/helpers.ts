import { dbDateToIso8601 } from "#src/lib/dates.js";
import type {
  OrgListRow,
  OrgRow,
  OrgsRepository,
} from "#v1/db-repositories/orgs-repository.js";

export function toUtcIso(value: string): string;
export function toUtcIso(value: null | undefined): null;
export function toUtcIso(value: string | null | undefined): string | null;
export function toUtcIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return dbDateToIso8601(value);
}

export async function requireEditableOrg(
  orgsRepository: OrgsRepository,
  idOrSlug: string,
  userId: string
): Promise<
  { ok: true; orgId: string; org: OrgRow } | { ok: false; status: 403 | 404 }
> {
  const org = await orgsRepository.findOrgByIdentifier(idOrSlug);
  if (!org) return { ok: false, status: 404 };
  if (!(await orgsRepository.canEdit(org.id, userId))) {
    return { ok: false, status: 403 };
  }
  return { ok: true, orgId: org.id, org };
}

export function toOrgResponse(org: OrgRow | OrgListRow, canEditOrg: boolean) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    avatar: org.avatar ?? null,
    profile: org.profile ?? null,
    rorId: org.rorId ?? null,
    unlisted: org.unlisted ?? null,
    createdAt: toUtcIso(org.createdAt),
    updatedAt: toUtcIso(org.updatedAt),
    canEdit: canEditOrg,
  };
}
