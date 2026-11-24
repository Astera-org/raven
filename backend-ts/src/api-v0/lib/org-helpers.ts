import { dbSelectValue } from "#v0/lib/db/db-select-value.js";
import { dbSelect, type Row } from "#v0/lib/db/db-select.js";
import { sql, type SQL } from "drizzle-orm";

export async function canEdit(orgId: number, userId: number): Promise<boolean> {
  const userState = (await dbSelectValue(
    sql`SELECT state FROM users WHERE id_int = ${userId}`
  )) as string | null;
  if (userState === "SITE_ADMIN") return true;

  return Boolean(
    await dbSelectValue(
      sql`SELECT 1 FROM org_user_map WHERE org_id_int = ${orgId} AND user_id_int = ${userId} AND (end_at IS NULL OR end_at > NOW()) AND FIND_IN_SET('ADMIN', roles)`
    )
  );
}

export async function getOrgByIdentifier(
  idOrSlug: string
): Promise<Row | null> {
  let whereClause: SQL;
  if (/^\d+$/.test(idOrSlug)) {
    whereClause = sql`id_int = ${parseInt(idOrSlug, 10)}`;
  } else {
    whereClause = sql`slug = ${idOrSlug}`;
  }
  const rows = await dbSelect(
    sql`SELECT id_int, id, name, slug, avatar, profile, ror_id, doi_prefix, doi_minting_enabled, unlisted, created_at, updated_at FROM organizations WHERE state = 'ACTIVE' AND ${whereClause}`
  );
  return rows[0] ?? null;
}

export async function slugifyOrgName(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org";
  let slug = base;
  let counter = 1;
  while (
    await dbSelectValue(sql`SELECT 1 FROM organizations WHERE slug = ${slug}`)
  ) {
    slug = `${base}-${counter}`;
    counter++;
  }
  return slug;
}
