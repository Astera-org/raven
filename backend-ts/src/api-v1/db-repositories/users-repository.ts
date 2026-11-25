import {
  comments,
  organizations,
  orgUserMap,
  publications,
  type User,
  users,
  type UserState,
  type UserUpdate,
  versions,
} from "#src/db/schema.js";
import { dateToIso8601, dbDateToIso8601 } from "#src/lib/dates.js";
import {
  getSearchResults,
  type UserSearchOptions,
} from "#src/lib/db-utils/search-users.js";
import { escapeLike } from "#src/lib/utils/escape-like.js";
import { generateColorFromId } from "#src/lib/utils/generate-color-from-id.js";
import { getPagination } from "#src/lib/utils/get-pagination.js";
import { type PaginationQueryRequest } from "#v1/lib/route-requests/pagination.js";
import { type PaginatedResponseV1 } from "#v1/lib/route-responses/pagination.js";
import { type NonOwnerUserResponse } from "#v1/lib/route-responses/user.js";
import { type AdminUserCommentListResponse } from "#v1/routes/admin/users/route-responses/admin-user-comment-list.js";
import {
  type AdminUserListResponse,
  type AdminUserOrganizationResponse,
} from "#v1/routes/admin/users/route-responses/admin-user-list.js";
import { type AdminUserOrgListResponse } from "#v1/routes/admin/users/route-responses/admin-user-org-list.js";
import { type AdminUserResponse } from "#v1/routes/admin/users/route-responses/admin-user.js";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  not,
  or,
} from "drizzle-orm";
import { BaseRepository } from "./base-repository.js";
import { adminCurrentVersion } from "./helpers/admin-current-version.js";
import { currentMembership } from "./helpers/org-membership.js";

const ACTIVE_STATES = ["ACTIVE", "SITE_ADMIN"] as const;

const adminUserColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  avatar: users.image,
  state: users.state,
  loginAt: users.loginAt,
  createdAt: users.createdAt,
};

function isoDates(row: Pick<User, "loginAt" | "createdAt">) {
  return {
    loginAt: dbDateToIso8601(row.loginAt),
    createdAt: dateToIso8601(row.createdAt),
  };
}

// Shared by the users list's `organization` and the user's org list, so the
// list always shows the first membership the org list returns.
const currentMembershipInActiveOrg = and(
  currentMembership(),
  eq(organizations.state, "ACTIVE")
);
const earliestMembershipFirst = [
  isNull(orgUserMap.startAt),
  asc(orgUserMap.startAt),
  asc(organizations.id),
];

export class UsersRepository extends BaseRepository {
  async findState(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ state: users.state })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.state ?? null;
  }

  async findByUsername(username: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return row ?? null;
  }

  async findByEmail(email: string) {
    return this.db.query.users.findFirst({
      columns: { idInt: false },
      where: eq(users.email, email),
    });
  }

  async findByOrcid(orcid: string) {
    return this.db.query.users.findFirst({
      columns: { idInt: false },
      where: eq(users.orcid, orcid),
    });
  }

  async list(
    query: PaginationQueryRequest
  ): Promise<PaginatedResponseV1<NonOwnerUserResponse>> {
    const { page, perPage, offset } = getPagination(query);
    const activeState = inArray(users.state, ACTIVE_STATES);

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          avatar: users.image,
          orcid: users.orcid,
        })
        .from(users)
        .where(activeState)
        .orderBy(desc(users.createdAt))
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(users).where(activeState),
    ]);

    return {
      items: items.map((i) => ({ ...i, iconColor: generateColorFromId(i.id) })),
      pagination: { total: totalRow?.total ?? 0, page, perPage },
    };
  }

  async listById(userIds: User["id"][]) {
    return await this.db.query.users.findMany({
      where: and(inArray(users.id, userIds), not(eq(users.state, "DELETED"))),
    });
  }

  /**
   * Ranked free-text search (username, ORCID, name, or — only with
   * `options.allowEmailLookup` — email) — delegates
   * the actual ranking SQL to the shared `getSearchResults`, which also
   * backs v0's `/users/search`, and just reshapes the rows to string ids.
   */
  async search(
    q: string,
    options?: UserSearchOptions | undefined
  ): Promise<NonOwnerUserResponse[]> {
    const results = await getSearchResults(q, options);
    return results.map((r) => ({
      id: r.id,
      username: r.username,
      firstName: r.firstName,
      lastName: r.lastName,
      avatar: r.avatar,
      orcid: r.orcid,
      iconColor: generateColorFromId(r.id),
    }));
  }

  /**
   * Site-admin users list: every state unless `state` narrows it, newest
   * first. Each whitespace-separated word of `searchTerm` must match the
   * username, email, first name or last name. `stats` ignores both filters.
   */
  async listForAdmins(filters: {
    state?: UserState | undefined;
    searchTerm?: string | undefined;
    pagination: PaginationQueryRequest;
  }): Promise<AdminUserListResponse> {
    const { page, perPage, offset } = getPagination(filters.pagination);

    const searchWords = filters.searchTerm?.split(/\s+/).filter(Boolean) ?? [];
    const whereClause = and(
      filters.state ? eq(users.state, filters.state) : undefined,
      ...searchWords.map((word) => {
        const pattern = `%${escapeLike(word)}%`;
        return or(
          like(users.username, pattern),
          like(users.email, pattern),
          like(users.firstName, pattern),
          like(users.lastName, pattern)
        );
      })
    );

    const [rows, [totalRow], stateCounts] = await Promise.all([
      this.db
        .select(adminUserColumns)
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(perPage)
        .offset(offset),
      this.db.select({ total: count() }).from(users).where(whereClause),
      this.db
        .select({ state: users.state, total: count() })
        .from(users)
        .groupBy(users.state),
    ]);

    const orgsByUser = await this.listEarliestActiveOrgs(
      rows.map((row) => row.id)
    );
    const countInState = (state: UserState) =>
      stateCounts.find((row) => row.state === state)?.total ?? 0;

    return {
      pagination: { total: totalRow?.total ?? 0, page, perPage },
      stats: {
        totalUsers: stateCounts.reduce((sum, row) => sum + row.total, 0),
        totalSiteAdmins: countInState("SITE_ADMIN"),
        totalDeleted: countInState("DELETED"),
      },
      items: rows.map((row) => ({
        ...row,
        ...isoDates(row),
        organization: orgsByUser.get(row.id) ?? null,
      })),
    };
  }

  /** A user in any state, for the site-admin user detail page. */
  async findForAdmins(userId: User["id"]): Promise<AdminUserResponse | null> {
    const [row] = await this.db
      .select({
        ...adminUserColumns,
        orcid: users.orcid,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ? { ...row, ...isoDates(row) } : null;
  }

  async update(userId: User["id"], updates: UserUpdate): Promise<void> {
    if (Object.keys(updates).length === 0) return;
    await this.db.update(users).set(updates).where(eq(users.id, userId));
  }

  /**
   * The user's published comments, newest first, each with the publication it
   * is on and the title of the version the admin list serves for it.
   */
  async listComments(
    userId: User["id"],
    pagination: PaginationQueryRequest
  ): Promise<AdminUserCommentListResponse> {
    const { page, perPage, offset } = getPagination(pagination);
    const whereClause = and(
      eq(comments.userId, userId),
      eq(comments.state, "PUBLISHED")
    );

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          id: comments.id,
          body: comments.body,
          createdAt: comments.createdAt,
          publicationId: publications.id,
          slug: publications.slug,
          title: versions.title,
        })
        .from(comments)
        .innerJoin(publications, eq(publications.id, comments.publicationId))
        .leftJoin(versions, adminCurrentVersion(this.db))
        .where(whereClause)
        .orderBy(desc(comments.createdAt), desc(comments.id))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(comments)
        .innerJoin(publications, eq(publications.id, comments.publicationId))
        .where(whereClause),
    ]);

    return {
      pagination: { total: totalRow?.total ?? 0, page, perPage },
      items: rows.map(({ publicationId, slug, title, ...comment }) => ({
        ...comment,
        createdAt: dbDateToIso8601(comment.createdAt),
        publication: { id: publicationId, slug, title },
      })),
    };
  }

  /**
   * The user's current memberships in ACTIVE orgs, earliest first (by
   * `start_at`, memberships without one last).
   */
  async listOrgs(
    userId: User["id"],
    pagination: PaginationQueryRequest
  ): Promise<AdminUserOrgListResponse> {
    const { page, perPage, offset } = getPagination(pagination);
    const whereClause = and(
      eq(orgUserMap.userId, userId),
      currentMembershipInActiveOrg
    );

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          orgId: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          roles: orgUserMap.roles,
          startAt: orgUserMap.startAt,
        })
        .from(orgUserMap)
        .innerJoin(organizations, eq(organizations.id, orgUserMap.orgId))
        .where(whereClause)
        .orderBy(...earliestMembershipFirst)
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(orgUserMap)
        .innerJoin(organizations, eq(organizations.id, orgUserMap.orgId))
        .where(whereClause),
    ]);

    return {
      pagination: { total: totalRow?.total ?? 0, page, perPage },
      items: rows.map(({ roles, startAt, ...org }) => ({
        ...org,
        isAdmin: (roles ?? []).includes("ADMIN"),
        startAt: dbDateToIso8601(startAt),
      })),
    };
  }

  /**
   * Each user's earliest current membership (by `start_at`, memberships
   * without one last) in an ACTIVE org, keyed by user id. Users with none are
   * absent from the map.
   */
  private async listEarliestActiveOrgs(
    userIds: User["id"][]
  ): Promise<Map<User["id"], AdminUserOrganizationResponse>> {
    if (userIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        userId: orgUserMap.userId,
        orgId: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        roles: orgUserMap.roles,
      })
      .from(orgUserMap)
      .innerJoin(organizations, eq(organizations.id, orgUserMap.orgId))
      .where(
        and(inArray(orgUserMap.userId, userIds), currentMembershipInActiveOrg)
      )
      .orderBy(...earliestMembershipFirst);

    const orgsByUser = new Map<User["id"], AdminUserOrganizationResponse>();
    for (const { userId, roles, ...org } of rows) {
      if (orgsByUser.has(userId)) continue;
      orgsByUser.set(userId, {
        ...org,
        isAdmin: (roles ?? []).includes("ADMIN"),
      });
    }
    return orgsByUser;
  }
}
