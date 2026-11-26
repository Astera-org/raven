import { getConfig } from "#src/config.js";
import { getDb } from "#src/db/index.js";
import {
  mediaAssets,
  users,
  versionMediaAssetMap,
  versions,
} from "#src/db/schema.js";
import { escapeLike } from "#src/lib/utils/escape-like.js";
import { type AppEnv } from "#src/types/hono.js";
import { eq, sql, type SQL } from "drizzle-orm";
import type { Context } from "hono";

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function getPagination(query: Record<string, string | undefined>) {
  const page = Math.max(parseInt(query["page"] ?? "1", 10) || 1, 1);
  const perPage = Math.min(parseInt(query["per_page"] ?? "18", 10) || 18, 100);
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}

// ---------------------------------------------------------------------------
// Session user
// ---------------------------------------------------------------------------

export const SIGN_IN_ENDPOINTS =
  "/api/auth2/sign-in/email or /api/auth2/sign-in/username";

/**
 * The `msg` of a v0 401 for a missing session. v0 is frozen, so routes that
 * answered with a JWT-era `{ msg }` keep that shape.
 */
export const NO_SESSION_MSG = `No session. Sign in via ${SIGN_IN_ENDPOINTS}.`;

/**
 * Resolves the current request's better-auth session (set on the context by
 * `authMiddleware`, which runs globally) to the user's legacy int id.
 */
export async function getSessionUserId(
  c: Context<AppEnv>
): Promise<number | null> {
  const user = c.get("user");
  if (!user) return null;
  /**
   * @todo This is a temporary solution until we switch to string ids fully
   */
  const rows = await getDb()
    .select({ id: users.idInt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  return rows.length === 1 ? rows[0]!.id : null;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function jsonError(message: string, status: number) {
  return { error: message, _status: status } as const;
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

export function generateUsername(
  db: ReturnType<typeof getDb>,
  firstName: string,
  lastName: string
): Promise<string> {
  const firstInitial = firstName?.[0] ?? "u";
  return _findUniqueUsername(db, `${firstInitial}${lastName}`);
}

async function _findUniqueUsername(
  db: ReturnType<typeof getDb>,
  base: string
): Promise<string> {
  let candidate = base;
  let counter = 2;
  while (true) {
    const [rows] = (await db.execute(
      sql`SELECT username FROM users WHERE username = ${candidate}`
    )) as unknown as [Array<unknown>];
    if (rows.length === 0) return candidate;
    candidate = `${base}${counter}`;
    counter++;
  }
}

interface UserMatchOptions {
  usernameExact?: boolean;
  /**
   * Whether an identifier containing `@` may be matched against the start of
   * users' emails. Pass `true` only for signed-in callers; otherwise anyone
   * could check which addresses have accounts or recover them by prefix.
   * When `false` or omitted, an email identifier matches no one.
   */
  allowEmailLookup?: boolean;
}

const ORCID_REGEX = /^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/;

export async function matchUsers(
  identifier: string,
  options?: UserMatchOptions
) {
  const db = getDb();
  const baseSelect = sql`SELECT username, image as avatar, first_name, last_name, orcid FROM users WHERE state IN ('ACTIVE','SITE_ADMIN') AND`;

  // An empty identifier would match every user via `LIKE '%'` below.
  if (identifier.trim() === "") return [];

  if (identifier.includes("@")) {
    if (!options?.allowEmailLookup) return [];
    const [rows] = (await db.execute(
      sql`${baseSelect} email LIKE ${`${escapeLike(identifier)}%`}`
    )) as unknown as [Array<Record<string, unknown>>];
    return rows;
  }
  if (identifier.includes(" ")) {
    const [firstName, lastName] = identifier.split(" ", 2);
    const [rows] = (await db.execute(
      sql`${baseSelect} first_name LIKE ${`${escapeLike(firstName!)}%`} AND last_name LIKE ${`${escapeLike(lastName!)}%`}`
    )) as unknown as [Array<Record<string, unknown>>];
    return rows;
  }
  if (ORCID_REGEX.test(identifier)) {
    const [rows] = (await db.execute(
      sql`${baseSelect} orcid LIKE ${`${escapeLike(identifier)}%`}`
    )) as unknown as [Array<Record<string, unknown>>];
    return rows;
  }
  if (options?.usernameExact) {
    const [rows] = (await db.execute(
      sql`${baseSelect} username = ${escapeLike(identifier)}`
    )) as unknown as [Array<Record<string, unknown>>];
    return rows;
  }
  const [rows] = (await db.execute(
    sql`${baseSelect} username LIKE ${`${escapeLike(identifier)}%`}`
  )) as unknown as [Array<Record<string, unknown>>];
  return rows;
}

// ---------------------------------------------------------------------------
// Publication list helper
// ---------------------------------------------------------------------------

export async function getPublicationsList(
  data: Record<string, string | undefined>,
  searchTerm: string,
  join: SQL | null = null,
  condition: SQL | null = null
) {
  const db = getDb();
  const { page, perPage, offset } = getPagination(data);

  // Results in an escaped string with the value, or if null then the empty
  // string is not escaped, it's just added as nothing, sql doesn't escape other
  // sql strings.
  const joinFrag = join ?? sql``;
  const condFrag = condition ?? sql``;

  let searchClause: SQL = sql``;
  if (searchTerm) {
    const likePattern = `%${escapeLike(searchTerm.toLowerCase())}%`;
    searchClause = sql` AND ( MATCH(v.title, v.abstract, v.body) AGAINST (${searchTerm} IN BOOLEAN MODE) OR EXISTS ( SELECT 1 FROM contributors c JOIN users u ON u.id_int = c.user_id_int WHERE c.version_id_int = v.id_int AND ( LOWER(u.first_name) LIKE ${likePattern} OR LOWER(u.last_name) LIKE ${likePattern} OR LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE ${likePattern} ) ) )`;
  }

  const [[items], [countRows]] = await Promise.all([
    db.execute(
      sql`SELECT DISTINCT p.id_int, v.id_int as version_id_int, p.slug, p.doi, p.state, p.latest_version_number as version_number, v.title, v.abstract, p.created_at FROM publications p JOIN versions v ON v.publication_id_int = p.id_int AND v.version_number = p.latest_version_number ${joinFrag} WHERE p.state = 'PUBLISHED' AND v.state = 'PUBLISHED' ${searchClause} ${condFrag} ORDER BY p.created_at DESC, p.id_int DESC LIMIT ${perPage} OFFSET ${offset}`
    ) as unknown as Promise<[Array<Record<string, unknown>>]>,
    db.execute(
      sql`SELECT COUNT(DISTINCT p.id_int) as total FROM publications p JOIN versions v ON v.publication_id_int = p.id_int AND v.version_number = p.latest_version_number ${joinFrag} WHERE p.state = 'PUBLISHED' AND v.state = 'PUBLISHED' ${searchClause} ${condFrag}`
    ) as unknown as Promise<[Array<Record<string, unknown>>]>,
  ]);

  const total = (countRows[0] as { total: number } | undefined)?.total ?? 0;

  for (const item of items) {
    const pubId = item["id_int"] as number;
    const versionId = item["version_id_int"] as number;
    item["id"] = pubId;
    delete item["id_int"];
    delete item["version_id_int"];
    const [contribs, orgs, tags, countResult] = await Promise.all([
      getContributors(versionId),
      getOrgs(pubId),
      getTags(pubId),
      db.execute(
        sql`SELECT COUNT(*) as cnt FROM comments WHERE publication_id_int = ${pubId} AND state IN ('PUBLISHED', 'WITHDRAWN')`
      ) as unknown as Promise<[Array<{ cnt: number }>]>,
    ]);
    item["contributors"] = contribs;
    item["orgs"] = orgs;
    item["tags"] = tags;
    item["num_comments"] = countResult[0]?.[0]?.cnt ?? 0;
  }

  return { pagination: { total, page, per_page: perPage }, items };
}

// ---------------------------------------------------------------------------
// Contrib / org / tag helpers
// ---------------------------------------------------------------------------

/**
 * A version's contributors as v0 lists them: one entry per role, since v0
 * predates a contributor holding several roles in one row.
 */
export async function getContributors(versionId: number) {
  const db = getDb();
  const [[contribRows], [affRows]] = await Promise.all([
    db.execute(
      sql`SELECT c.user_id_int, c.roles, c.in_byline, c.priority, u.first_name, u.last_name, u.image as avatar FROM contributors c JOIN users u ON u.id_int = c.user_id_int WHERE c.version_id_int = ${versionId} ORDER BY c.priority IS NULL, c.priority`
    ) as unknown as Promise<[Array<Record<string, unknown>>]>,
    db.execute(
      sql`SELECT ca.user_id_int, ca.affiliated_org_id_int, o.name, o.slug, o.ror_id, o.avatar FROM contributor_affiliations ca JOIN organizations o ON o.id_int = ca.affiliated_org_id_int WHERE ca.version_id_int = ${versionId}`
    ) as unknown as Promise<[Array<Record<string, unknown>>]>,
  ]);

  const affiliationsByUser: Map<
    number,
    Array<Record<string, unknown>>
  > = new Map();
  for (const a of affRows) {
    const uid = a["user_id_int"] as number;
    if (!affiliationsByUser.has(uid)) affiliationsByUser.set(uid, []);
    affiliationsByUser.get(uid)!.push({
      org_id: a["affiliated_org_id_int"],
      name: a["name"],
      slug: a["slug"],
      ror_id: a["ror_id"],
      avatar: a["avatar"],
    });
  }

  return contribRows.flatMap((row) =>
    (row["roles"] as string[]).map((role) => ({
      user_id: row["user_id_int"],
      role,
      first_name: row["first_name"],
      last_name: row["last_name"],
      avatar: row["avatar"],
      in_byline: row["in_byline"],
      priority: row["priority"],
      affiliations: affiliationsByUser.get(row["user_id_int"] as number) ?? [],
    }))
  );
}

export async function getOrgs(publicationId: number) {
  const db = getDb();
  const [rows] = (await db.execute(
    sql`SELECT m.org_id_int, m.priority, o.slug, o.name, o.avatar FROM org_publication_map m JOIN organizations o ON o.id_int = m.org_id_int WHERE m.publication_id_int = ${publicationId}`
  )) as unknown as [Array<Record<string, unknown>>];
  return rows;
}

export async function getTags(publicationId: number): Promise<string[]> {
  const db = getDb();
  const [rows] = (await db.execute(
    sql`SELECT tag FROM publication_tags WHERE publication_id_int = ${publicationId}`
  )) as unknown as [Array<{ tag: string }>];
  return rows.map((r) => r.tag);
}

export async function getMediaAssets(versionId: number) {
  const db = getDb();
  const items = await db
    .select({
      id: mediaAssets.id,
      byteSize: mediaAssets.byteSize,
      mimeType: mediaAssets.mimeType,
      kind: mediaAssets.kind,
      publicUrl: mediaAssets.publicUrl,
      width: mediaAssets.width,
      height: mediaAssets.height,
      durationMs: mediaAssets.durationMs,
      rotation: mediaAssets.rotation,
    })
    .from(mediaAssets)
    .innerJoin(
      versionMediaAssetMap,
      eq(mediaAssets.id, versionMediaAssetMap.mediaAssetId)
    )
    .innerJoin(versions, eq(versions.id, versionMediaAssetMap.versionId))
    .where(eq(versions.idInt, versionId));

  return items;
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

export async function userBelongsToOrgs(
  userId: number,
  orgNames: string[]
): Promise<boolean> {
  if (orgNames.length === 0) return false;
  const db = getDb();
  const orgNamesJoin = sql.join(
    orgNames.map((n) => sql`${n}`),
    sql`, `
  );
  const [rows] = (await db.execute(
    sql`SELECT 1 FROM org_user_map ou INNER JOIN organizations o ON o.id_int = ou.org_id_int WHERE o.name IN (${orgNamesJoin}) AND ou.user_id_int = ${userId} AND (ou.end_at IS NULL OR ou.end_at > NOW())`
  )) as unknown as [Array<unknown>];
  return rows.length > 0;
}

export async function canCreatePublications(
  userId: number,
  state: string
): Promise<boolean> {
  if (state === "SITE_ADMIN") return true;
  return userBelongsToOrgs(userId, getConfig().PUBLICATION_CREATOR_ORGS);
}

export async function isDoiMintingEnabled(
  publicationId: number
): Promise<boolean> {
  const db = getDb();
  const [rows] = (await db.execute(
    sql`SELECT 1 FROM org_publication_map op JOIN organizations o ON o.id_int = op.org_id_int WHERE op.publication_id_int = ${publicationId} AND o.doi_minting_enabled = TRUE LIMIT 1`
  )) as unknown as [Array<unknown>];
  return rows.length > 0;
}

export async function isOrgAdminAnywhere(userId: number): Promise<boolean> {
  const db = getDb();
  const [rows] = (await db.execute(
    sql`SELECT 1 FROM org_user_map WHERE user_id_int = ${userId} AND (start_at IS NULL OR start_at <= NOW()) AND (end_at IS NULL OR end_at > NOW()) AND FIND_IN_SET('ADMIN', roles) LIMIT 1`
  )) as unknown as [Array<unknown>];
  return rows.length > 0;
}

export async function canDeleteCommentsOnPublication(
  publicationId: number,
  userId: number
): Promise<boolean> {
  if (!publicationId || !userId) return false;
  const db = getDb();
  const [rows] = (await db.execute(
    sql`SELECT EXISTS ( SELECT 1 FROM publications p INNER JOIN org_publication_map oa ON oa.publication_id_int = p.id_int INNER JOIN org_user_map ou ON ou.org_id_int = oa.org_id_int WHERE p.id_int = ${publicationId} AND ou.user_id_int = ${userId} AND p.state = 'DRAFT' AND FIND_IN_SET('ADMIN', ou.roles) AND (ou.end_at IS NULL OR ou.end_at > NOW()) ) as ex`
  )) as unknown as [Array<{ ex: number }>];
  return Boolean(rows[0]?.ex);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export async function getNameFromOrcid(
  orcid: string
): Promise<[string, string]> {
  try {
    const resp = await fetch(`https://pub.orcid.org/v3.0/${orcid}/person`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return ["", ""];
    const data = (await resp.json()) as Record<string, unknown>;
    const name = data["name"] as
      Record<string, Record<string, string>> | undefined;
    return [
      name?.["given-names"]?.["value"] ?? "",
      name?.["family-name"]?.["value"] ?? "",
    ];
  } catch {
    return ["", ""];
  }
}

export function dateToUtcIso(
  d: Date | string | null | undefined
): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  return isNaN(date.getTime()) ? null : date.toISOString();
}

export function dbDateStringToIso(d: string | null | undefined): string | null {
  if (!d) return null;
  // MySQL DATETIME columns come back as "YYYY-MM-DD HH:MM:SS" with no
  // timezone info, but the values are stored as UTC. Left alone, the JS
  // Date parser would interpret that string in the local timezone, so
  // normalize it to an unambiguous UTC string before parsing.
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(d);
  const normalized = hasTimezone ? d : `${d.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return dateToUtcIso(date);
}
