import { getDb } from "#src/db/index.js";
import { users } from "#src/db/schema.js";
import { escapeLike } from "#src/lib/utils/escape-like.js";
import { generateColorFromId } from "#src/lib/utils/generate-color-from-id.js";
import { getPagination } from "#src/lib/utils/get-pagination.js";
import { type UserResponse } from "#v0/types/response.js";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";

// Text-match quality tiers, biggest gap first. The gap between any two tiers
// must stay bigger than ORG_AFFINITY_BONUS below, so org affinity can only
// reorder rows within a tier — it can never let a weaker text match (e.g. a
// same-org fuzzy name hit) outrank a stronger one (e.g. a different-org exact
// match).
const MATCH_SCORE = {
  EXACT_IDENTIFIER: 1000, // caller-declared exact username / full ORCID / full email
  NAME_EXACT: 900,
  ORCID_PREFIX: 800, // no partial orcid search at the moment
  EMAIL_PREFIX: 750,
  NAME_PREFIX: 700,
  NAME_PREFIX_REVERSED: 650,
  SINGLE_TOKEN_USERNAME_EXACT: 600,
  SINGLE_TOKEN_PREFIX: 500,
  NAME_SUBSTRING_FALLBACK: 400,
} as const;

// Small, capped bonus for being affiliated with a "contextually relevant" org
// (e.g. the org a publication belongs to). Must stay smaller than the
// smallest gap between MATCH_SCORE tiers above.
const ORG_AFFINITY_BONUS = 10;

// Builds a SQL expression that adds ORG_AFFINITY_BONUS when the candidate
// user is (currently) a member of one of contextOrgIds, else 0. Which org ids
// count as "contextually relevant" is a caller decision (e.g. the publication's
// orgs, or a fallback to the requesting user's own orgs) — this helper only
// scores against whatever set it's given.
function orgAffinitySql(contextOrgIds: number[] | undefined) {
  if (!contextOrgIds || contextOrgIds.length === 0) {
    return sql<number>`0`;
  }
  const orgIdList = sql.join(
    contextOrgIds.map((id) => sql`${id}`),
    sql`, `
  );
  return sql<number>`(
    CASE WHEN EXISTS (
      SELECT 1 FROM org_user_map oum
      WHERE oum.user_id_int = ${users.idInt}
        AND oum.org_id_int IN (${orgIdList})
        AND (oum.end_at IS NULL OR oum.end_at > NOW())
    ) THEN ${ORG_AFFINITY_BONUS} ELSE 0 END
  )`;
}

// Matches ORCID iDs with or without dashes; final digit may be the "X" checksum character.
const ORCID_RE = /^\d{4}-?\d{4}-?\d{4}-?\d{3}[\dX]$/i;

// Reformats a dash-free or partially-dashed ORCID into the canonical dddd-dddd-dddd-dddX form
// so it matches how ORCIDs are stored in the users table.
function normalizeOrcid(input: string): string {
  const digits = input.replace(/-/g, "").toUpperCase();
  return digits.replace(/(.{4})(?=.)/g, "$1-");
}

// Only these states are considered "real" users; excludes e.g. deactivated/invited accounts.
const ACTIVE_STATES = ["ACTIVE", "SITE_ADMIN"] as const;

const baseColumns = {
  id: users.id,
  idInt: users.idInt,
  username: users.username,
  avatar: users.image,
  firstName: users.firstName,
  lastName: users.lastName,
  orcid: users.orcid,
};

export interface UserSearchOptions {
  // Skip the fuzzy heuristics and search the identifier as an exact username.
  // Useful when the caller already knows the exact value (e.g. programmatic lookups).
  usernameExact?: boolean;
  // Org ids to use as an affinity signal for ranking (see ORG_AFFINITY_BONUS
  // above) — e.g. the orgs a publication belongs to, or a fallback set
  // resolved by the caller. Resolving *which* orgs are relevant is the
  // caller's job; this function just ranks candidates who belong to them
  // slightly higher.
  contextOrgIds?: number[];
  // Whether a query containing `@` may be matched against users' emails
  // (exact address or prefix). Set it only for signed-in callers, since
  // search results are otherwise public. When false or omitted, an email
  // query matches no one.
  allowEmailLookup?: boolean;
  // Pagination:
  page?: number;
  perPage?: number;
}

export async function searchUsers(
  identifier: string,
  options?: UserSearchOptions
): Promise<UserResponse[]> {
  const results = await getSearchResults(identifier, options);

  return results.map(
    (r): UserResponse => ({
      id: r.idInt,
      username: r.username,
      first_name: r.firstName,
      last_name: r.lastName,
      avatar: r.avatar,
      orcid: r.orcid,
      icon_color: generateColorFromId(r.id),
    })
  );
}

interface SearchUsersResponse {
  matchScore: number;
  id: string;
  idInt: number;
  username: string;
  avatar: string | null;
  firstName: string;
  lastName: string;
  orcid: string | null;
}

// Looks up users by a single free-text identifier, trying progressively more specific
// interpretations: exact username -> ORCID -> email -> "first last" name -> single token
// (username/first/last).
export async function getSearchResults(
  identifier: string,
  options: UserSearchOptions = {}
): Promise<SearchUsersResponse[]> {
  const db = getDb();
  const trimmed = identifier.trim();
  const { perPage, offset } = getPagination(options);
  const limit = perPage;

  if (options?.usernameExact) {
    const score = sql<number>`${MATCH_SCORE.EXACT_IDENTIFIER} + ${orgAffinitySql(options?.contextOrgIds)}`;
    return db
      .select({ ...baseColumns, matchScore: score })
      .from(users)
      .where(
        and(inArray(users.state, ACTIVE_STATES), eq(users.username, trimmed))
      )
      .limit(limit)
      .offset(offset);
  }

  if (ORCID_RE.test(trimmed)) {
    const orcid = normalizeOrcid(trimmed);
    const affinity = orgAffinitySql(options?.contextOrgIds);
    const matchScore = sql<number>`(
      CASE WHEN ${users.orcid} = ${orcid}
        THEN ${MATCH_SCORE.EXACT_IDENTIFIER}
        ELSE 0
      END
    )`;
    return db
      .select({
        ...baseColumns,
        matchScore: sql<number>`${matchScore} + ${affinity}`,
      })
      .from(users)
      .where(
        and(
          inArray(users.state, ACTIVE_STATES),
          like(users.orcid, `${escapeLike(orcid)}%`)
        )
      )
      .orderBy(desc(sql`${matchScore} + ${affinity}`))
      .limit(limit)
      .offset(offset);
  }

  if (trimmed.includes("@")) {
    // See `allowEmailLookup`: no email matching for anonymous callers, so
    // they can't check which addresses have accounts or recover them by
    // prefix.
    if (!options?.allowEmailLookup) return [];
    const affinity = orgAffinitySql(options?.contextOrgIds);
    const matchScore = sql<number>`(
      CASE WHEN ${users.email} = ${trimmed}
        THEN ${MATCH_SCORE.EXACT_IDENTIFIER}
        ELSE ${MATCH_SCORE.EMAIL_PREFIX}
      END
    )`;
    return db
      .select({
        ...baseColumns,
        matchScore: sql<number>`${matchScore} + ${affinity}`,
      })
      .from(users)
      .where(
        and(
          inArray(users.state, ACTIVE_STATES),
          like(users.email, `${escapeLike(trimmed)}%`)
        )
      )
      .orderBy(desc(sql`${matchScore} + ${affinity}`))
      .limit(limit)
      .offset(offset);
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    const first = parts[0]!;
    const rest = parts.slice(1).join(" ");
    const affinity = orgAffinitySql(options?.contextOrgIds);
    const matchScore = sql<number>`(
      CASE
        WHEN ${users.firstName} = ${first} AND ${users.lastName} = ${rest}
          THEN ${MATCH_SCORE.NAME_EXACT}
        WHEN ${users.firstName} LIKE ${`${escapeLike(first)}%`}
          AND ${users.lastName} LIKE ${`${escapeLike(rest)}%`}
          THEN ${MATCH_SCORE.NAME_PREFIX}
        WHEN ${users.firstName} LIKE ${`${escapeLike(rest)}%`}
          AND ${users.lastName} LIKE ${`${escapeLike(first)}%`}
          THEN ${MATCH_SCORE.NAME_PREFIX_REVERSED}
        ELSE ${MATCH_SCORE.NAME_SUBSTRING_FALLBACK}
      END
    )`;

    return db
      .select({
        ...baseColumns,
        matchScore: sql<number>`${matchScore} + ${affinity}`,
      })
      .from(users)
      .where(
        and(
          inArray(users.state, ACTIVE_STATES),
          or(
            // "first last" order
            and(
              like(users.firstName, `${escapeLike(first)}%`),
              like(users.lastName, `${escapeLike(rest)}%`)
            ),
            // "last first" order, in case the user typed it that way round
            and(
              like(users.firstName, `${escapeLike(rest)}%`),
              like(users.lastName, `${escapeLike(first)}%`)
            ),
            // fallback: substring match against the concatenated full name, to catch
            // middle names/multi-word last names that don't fit the two-part split above
            like(
              sql`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
              `%${escapeLike(trimmed)}%`
            )
          )
        )
      )
      .orderBy(desc(sql`${matchScore} + ${affinity}`))
      .limit(limit)
      .offset(offset);
  }

  // Single-word query: could be a username or a first/last name, so try all three.
  const token = parts[0] ?? "";
  const affinity = orgAffinitySql(options?.contextOrgIds);
  const matchScore = sql<number>`(
    CASE WHEN ${users.username} = ${token}
      THEN ${MATCH_SCORE.SINGLE_TOKEN_USERNAME_EXACT}
      ELSE ${MATCH_SCORE.SINGLE_TOKEN_PREFIX}
    END
  )`;

  return db
    .select({
      ...baseColumns,
      matchScore: sql<number>`${matchScore} + ${affinity}`,
    })
    .from(users)
    .where(
      and(
        inArray(users.state, ACTIVE_STATES),
        or(
          like(users.username, `${escapeLike(token)}%`),
          like(users.firstName, `${escapeLike(token)}%`),
          like(users.lastName, `${escapeLike(token)}%`)
        )
      )
    )
    .orderBy(
      desc(sql`${matchScore} + ${affinity}`),
      // among equal-score rows, shorter usernames are more likely to be the
      // intended match than a long username that merely starts with the token
      asc(sql`LENGTH(${users.username})`)
    )
    .limit(limit)
    .offset(offset);
}
