import {
  comments,
  type Contributor,
  contributorAffiliations,
  contributors,
  type Organization,
  type OrganizationInsert,
  organizations,
  type OrganizationUpdate,
  type OrgPublicationConnection,
  orgPublicationMap,
  type OrgUserConnection,
  orgUserMap,
  type Publication,
  publications,
  type PublicationTag,
  publicationTags,
  type User,
  users,
  type Version,
  versions,
} from "#src/db/schema.js";
import { getPagination } from "#src/lib/utils/get-pagination.js";
import { type PaginationQueryRequest } from "#v1/lib/route-requests/pagination.js";
import { type PaginatedResponseV1 } from "#v1/lib/route-responses/pagination.js";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { BaseRepository } from "./base-repository.js";
import { type ContributorAffiliationRow } from "./contributors-repository.js";
import { adminCurrentVersion } from "./helpers/admin-current-version.js";
import {
  activeAdminMembership,
  activeMembership,
  currentMembership,
} from "./helpers/org-membership.js";
import { tf, type TriggerFilled } from "./helpers/trigger-filled-map.js";

export type OrgRow = NonNullable<
  Awaited<ReturnType<OrgsRepository["findOrgByIdentifier"]>>
>;

export type OrgListRow = {
  id: Organization["id"];
  name: Organization["name"];
  slug: Organization["slug"];
  avatar: Organization["avatar"];
  profile: Organization["profile"];
  rorId: Organization["rorId"];
  unlisted: Organization["unlisted"];
  createdAt: Organization["createdAt"];
  updatedAt: Organization["updatedAt"];
};

export type AdministeredOrgRow = {
  id: Organization["id"];
  slug: Organization["slug"];
  name: Organization["name"];
};

export type OrgMemberRow = {
  id: User["id"];
  username: User["username"];
  email: User["email"];
  firstName: User["firstName"];
  lastName: User["lastName"];
  image: User["image"];
  orcid: User["orcid"];
  roles: OrgUserConnection["roles"];
  startAt: OrgUserConnection["startAt"];
  endAt: OrgUserConnection["endAt"];
};

export type AdminOrgMemberRow = OrgMemberRow & {
  state: User["state"];
  createdAt: User["createdAt"];
};

const adminMemberColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  image: users.image,
  orcid: users.orcid,
  roles: orgUserMap.roles,
  startAt: orgUserMap.startAt,
  endAt: orgUserMap.endAt,
  state: users.state,
  createdAt: users.createdAt,
};

export type OrgPublicationContributorRow = {
  userId: Contributor["userId"];
  roles: Contributor["roles"];
  firstName: User["firstName"];
  lastName: User["lastName"];
  avatar: User["image"];
  inByline: Contributor["inByline"];
  priority: Contributor["priority"];
  affiliations: ContributorAffiliationRow[];
};

export type OrgPublicationOrgRow = {
  orgId: OrgPublicationConnection["orgId"];
  priority: OrgPublicationConnection["priority"];
  slug: Organization["slug"];
  name: Organization["name"];
  avatar: Organization["avatar"];
};

export type OrgPublicationListRow = {
  id: Publication["id"];
  slug: Publication["slug"];
  doi: Publication["doi"];
  title: Version["title"];
  subtitle: Version["subtitle"];
  abstract: Version["abstract"];
  createdAt: Publication["createdAt"];
  numComments: number;
  contributors: OrgPublicationContributorRow[];
  orgs: OrgPublicationOrgRow[];
  tags: PublicationTag["tag"][];
  latestVersionNumber: Publication["latestVersionNumber"];
  state: Publication["state"];
};

export type AdminOrgListSort = "created" | "members" | "name" | "publications";

export type AdminOrgCounts = {
  currentMemberCount: number;
  totalMemberCount: number;
  publishedPublicationCount: number;
  totalPublicationCount: number;
};

export type AdminOrgWithPubAndMemberCounts = Omit<Organization, "idInt"> &
  AdminOrgCounts;

// Ties fall back to `id` so LIMIT/OFFSET pages never repeat or skip rows.
const alphabeticalMembers = [
  asc(users.lastName),
  asc(users.firstName),
  asc(users.username),
  asc(users.id),
];

const orgColumns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  avatar: organizations.avatar,
  profile: organizations.profile,
  rorId: organizations.rorId,
  unlisted: organizations.unlisted,
  createdAt: organizations.createdAt,
  updatedAt: organizations.updatedAt,
};

export class OrgsRepository extends BaseRepository {
  /**
   * Resolves an org's legacy int id.
   * Never accepted from a request, never returned in a response.
   */
  private async findOrgIdInt(orgId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ idInt: organizations.idInt })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return row?.idInt ?? null;
  }

  async findOrgByRorId(rorId: string) {
    const org = await this.db.query.organizations.findFirst({
      columns: { idInt: false },
      where: eq(organizations.rorId, rorId),
    });
    return org;
  }

  /**
   * Contributors on each publication's latest version, in byline order, with
   * their affiliations on that version.
   */
  private async listPublicationsLatestContributors(
    publicationIds: string[]
  ): Promise<Map<string, OrgPublicationContributorRow[]>> {
    const map = new Map<string, OrgPublicationContributorRow[]>();
    if (publicationIds.length === 0) return map;

    const rows = await this.db
      .select({
        publicationId: publications.id,
        versionId: versions.id,
        userId: contributors.userId,
        roles: contributors.roles,
        inByline: contributors.inByline,
        priority: contributors.priority,
        firstName: users.firstName,
        lastName: users.lastName,
        avatar: users.image,
      })
      .from(publications)
      .innerJoin(
        versions,
        and(
          eq(versions.publicationId, publications.id),
          eq(versions.versionNumber, publications.latestVersionNumber)
        )
      )
      .innerJoin(contributors, eq(contributors.versionId, versions.id))
      .innerJoin(users, eq(users.id, contributors.userId))
      .where(inArray(publications.id, publicationIds))
      .orderBy(
        sql`${contributors.priority} IS NULL`,
        asc(contributors.priority)
      );

    const affiliations = await this.listContributorAffiliations([
      ...new Set(rows.map((row) => row.versionId)),
    ]);

    for (const { publicationId, versionId, ...row } of rows) {
      const list = map.get(publicationId) ?? [];
      list.push({
        ...row,
        affiliations: affiliations.get(`${versionId}:${row.userId}`) ?? [],
      });
      map.set(publicationId, list);
    }
    return map;
  }

  /** Affiliations on the given versions, keyed by `${versionId}:${userId}`. */
  private async listContributorAffiliations(
    versionIds: string[]
  ): Promise<Map<string, ContributorAffiliationRow[]>> {
    const map = new Map<string, ContributorAffiliationRow[]>();
    if (versionIds.length === 0) return map;

    const rows = await this.db
      .select({
        versionId: contributorAffiliations.versionId,
        userId: contributorAffiliations.userId,
        orgId: contributorAffiliations.affiliatedOrgId,
        name: organizations.name,
        slug: organizations.slug,
        rorId: organizations.rorId,
        avatar: organizations.avatar,
      })
      .from(contributorAffiliations)
      .innerJoin(
        organizations,
        eq(contributorAffiliations.affiliatedOrgId, organizations.id)
      )
      .where(inArray(contributorAffiliations.versionId, versionIds));

    for (const { versionId, userId, ...affiliation } of rows) {
      const key = `${versionId}:${userId}`;
      const list = map.get(key) ?? [];
      list.push(affiliation);
      map.set(key, list);
    }
    return map;
  }

  private async listPublicationsOrgs(
    publicationIds: string[]
  ): Promise<Map<string, OrgPublicationOrgRow[]>> {
    const map = new Map<string, OrgPublicationOrgRow[]>();
    if (publicationIds.length === 0) return map;

    const rows = await this.db
      .select({
        publicationId: orgPublicationMap.publicationId,
        orgId: orgPublicationMap.orgId,
        priority: orgPublicationMap.priority,
        slug: organizations.slug,
        name: organizations.name,
        avatar: organizations.avatar,
      })
      .from(orgPublicationMap)
      .innerJoin(organizations, eq(organizations.id, orgPublicationMap.orgId))
      .where(inArray(orgPublicationMap.publicationId, publicationIds));

    for (const row of rows) {
      // Guaranteed non-null: the where clause above only matches rows whose
      // `orgPublicationMap.publicationId` is one of the ids we passed in.
      const list = map.get(row.publicationId!) ?? [];
      list.push({
        // Guaranteed non-null: the inner join above only matches rows where
        // `orgPublicationMap.orgId` equals an existing `organizations.id`.
        orgId: row.orgId!,
        priority: row.priority,
        slug: row.slug,
        name: row.name,
        avatar: row.avatar,
      });
      map.set(row.publicationId!, list);
    }
    return map;
  }

  private async listPublicationsTags(
    publicationIds: string[]
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (publicationIds.length === 0) return map;

    const rows = await this.db
      .select({
        publicationId: publicationTags.publicationId,
        tag: publicationTags.tag,
      })
      .from(publicationTags)
      .where(inArray(publicationTags.publicationId, publicationIds));

    for (const row of rows) {
      // Guaranteed non-null: the where clause above only matches rows whose
      // `publicationTags.publicationId` is one of the ids we passed in.
      const list = map.get(row.publicationId!) ?? [];
      list.push(row.tag);
      map.set(row.publicationId!, list);
    }
    return map;
  }

  private async getPublicationsCommentCounts(
    publicationIds: string[]
  ): Promise<Map<string, number>> {
    if (publicationIds.length === 0) return new Map();

    const rows = await this.db
      .select({ publicationId: comments.publicationId, cnt: count() })
      .from(comments)
      .where(
        and(
          inArray(comments.publicationId, publicationIds),
          eq(comments.state, "PUBLISHED")
        )
      )
      .groupBy(comments.publicationId);

    return new Map(rows.map((row) => [row.publicationId!, row.cnt]));
  }

  /**
   * Resolves a user's legacy int id.
   * Never accepted from a request, never returned in a response.
   */
  private async findUserIdInt(userId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ idInt: users.idInt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.idInt ?? null;
  }

  /**
   * Orgs a publication could be associated with: any org whose active
   * membership includes one of the publication's contributors or its owner.
   */
  async listPotentialOrgsForPublication(
    publicationId: string,
    ownerId: string | null
  ) {
    const contributorUserIds = this.db
      .select({ userId: contributors.userId })
      .from(contributors)
      .innerJoin(versions, eq(versions.id, contributors.versionId))
      .where(eq(versions.publicationId, publicationId));

    return this.db
      .selectDistinct({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        avatar: organizations.avatar,
        doiMintingEnabled: organizations.doiMintingEnabled,
      })
      .from(organizations)
      .innerJoin(orgUserMap, eq(orgUserMap.orgId, organizations.id))
      .where(
        and(
          or(
            inArray(orgUserMap.userId, contributorUserIds),
            ...(ownerId ? [eq(orgUserMap.userId, ownerId)] : [])
          ),
          activeMembership()
        )
      );
  }

  /**
   * Looks up an active organization by either its ULID id or its slug.
   */
  async findOrgByIdentifier(idOrSlug: string) {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(
        and(
          eq(organizations.state, "ACTIVE"),
          or(eq(organizations.id, idOrSlug), eq(organizations.slug, idOrSlug))
        )
      )
      .limit(1);

    return row ?? null;
  }

  /** Active orgs, newest first; unlisted ones only when `includeUnlisted`. */
  async list(
    { includeUnlisted }: { includeUnlisted: boolean },
    perPage: number,
    offset: number
  ): Promise<OrgListRow[]> {
    return this.db
      .select(orgColumns)
      .from(organizations)
      .where(this.visible(includeUnlisted))
      .orderBy(desc(organizations.createdAt), desc(organizations.id))
      .limit(perPage)
      .offset(offset);
  }

  /** Active orgs ordered by `sort` (newest first by default); unlisted ones
   * only when `includeUnlisted`. */
  async listWithAllValues(
    { includeUnlisted }: { includeUnlisted: boolean },
    perPage: number,
    offset: number,
    sort?: AdminOrgListSort,
    isDesc = true
  ): Promise<AdminOrgWithPubAndMemberCounts[]> {
    const counts = this.adminCounts();

    return this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        avatar: organizations.avatar,
        profile: organizations.profile,
        rorId: organizations.rorId,
        doiMintingEnabled: organizations.doiMintingEnabled,
        doiPrefix: organizations.doiPrefix,
        unlisted: organizations.unlisted,
        approved: organizations.approved,
        state: organizations.state,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        ...counts,
      })
      .from(organizations)
      .where(this.visible(includeUnlisted))
      .orderBy(...this.adminListOrder(sort, isDesc, counts))
      .limit(perPage)
      .offset(offset);
  }

  async count({
    includeUnlisted,
  }: {
    includeUnlisted: boolean;
  }): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(organizations)
      .where(this.visible(includeUnlisted));
    return row?.total ?? 0;
  }

  /** Org counts for admin views, correlated to `organizations.id`: current
   * (active) and total memberships of existing users, and published and total
   * publications of any state. Publications are counted by the same version
   * join as the admin publication list, so the counts match its totals. */
  private adminCounts() {
    const memberCount = (where?: SQL) =>
      sql`(${this.db
        .select({ total: count() })
        .from(orgUserMap)
        .innerJoin(users, eq(orgUserMap.userId, users.id))
        .where(and(eq(orgUserMap.orgId, organizations.id), where))})`.mapWith(
        Number
      );
    const publicationCount = (where?: SQL) =>
      sql`(${this.db
        .select({ total: count() })
        .from(orgPublicationMap)
        .innerJoin(
          publications,
          eq(publications.id, orgPublicationMap.publicationId)
        )
        .innerJoin(versions, adminCurrentVersion(this.db))
        .where(
          and(eq(orgPublicationMap.orgId, organizations.id), where)
        )})`.mapWith(Number);
    return {
      currentMemberCount: memberCount(activeMembership()),
      totalMemberCount: memberCount(),
      publishedPublicationCount: publicationCount(
        eq(publications.state, "PUBLISHED")
      ),
      totalPublicationCount: publicationCount(),
    };
  }

  async countForAdmins(orgId: Organization["id"]): Promise<AdminOrgCounts> {
    const [row] = await this.db
      .select(this.adminCounts())
      .from(organizations)
      .where(eq(organizations.id, orgId));
    return (
      row ?? {
        currentMemberCount: 0,
        totalMemberCount: 0,
        publishedPublicationCount: 0,
        totalPublicationCount: 0,
      }
    );
  }

  /** Orders an admin org list by `sort` (`created` when omitted), with `id`
   * as a tiebreaker so LIMIT/OFFSET pages never repeat or skip rows. */
  private adminListOrder(
    sort: AdminOrgListSort | undefined,
    isDesc: boolean,
    counts: { currentMemberCount: SQL; publishedPublicationCount: SQL }
  ) {
    const orderFn = isDesc ? desc : asc;
    const column =
      sort === "members"
        ? counts.currentMemberCount
        : sort === "publications"
          ? counts.publishedPublicationCount
          : sort === "name"
            ? organizations.name
            : organizations.createdAt;
    return [orderFn(column), orderFn(organizations.id)];
  }

  private visible(includeUnlisted: boolean) {
    const active = eq(organizations.state, "ACTIVE");
    if (includeUnlisted) return active;
    // `unlisted` defaults to false but is nullable; NULL counts as listed.
    return and(
      active,
      or(eq(organizations.unlisted, false), isNull(organizations.unlisted))
    );
  }

  async slugifyOrgName(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/[\s-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "org";
    return this.findNextUnusedSlug(base);
  }

  async findNextUnusedSlug(base: string): Promise<string> {
    let slug = base;
    let counter = 1;
    while (await this.existsSlug(slug)) {
      slug = `${base}-${counter}`;
      counter++;
    }
    return slug;
  }

  async existsSlug(slug: string): Promise<boolean> {
    const [row] = await this.db
      .select({ one: sql<number>`1` })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    return row != null;
  }

  async create(fields: TriggerFilled<typeof organizations>): Promise<void> {
    await this.db.insert(organizations).values({
      id: fields.id,
      name: fields.name,
      slug: fields.slug,
      avatar: fields.avatar,
      profile: fields.profile,
      rorId: fields.rorId,
      doiPrefix: fields.doiPrefix,
      doiMintingEnabled: fields.doiMintingEnabled,
      unlisted: fields.unlisted,
    } as OrganizationInsert);
  }

  // Both ids are ULIDs resolved from the request/session; the legacy int
  // ids `org_user_map` still requires are looked up internally so callers
  // never need to traffic in them.
  async addOrgAdmin(fields: { orgId: string; userId: string }): Promise<void> {
    await this.db.insert(orgUserMap).values(
      tf<typeof orgUserMap>({
        orgIdInt: null,
        orgId: fields.orgId,
        userIdInt: null,
        userId: fields.userId,
        roles: ["ADMIN"],
      })
    );
  }

  async update(orgId: string, updates: OrganizationUpdate): Promise<void> {
    if (Object.keys(updates).length === 0) return;
    await this.db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId));
  }

  async softDelete(orgId: string): Promise<void> {
    await this.db
      .update(organizations)
      .set({ state: "DELETED" })
      .where(eq(organizations.id, orgId));
  }

  async deleteAllMemberships(orgId: string): Promise<void> {
    await this.db.delete(orgUserMap).where(eq(orgUserMap.orgId, orgId));
  }

  async deleteAllPublicationMaps(orgId: string): Promise<void> {
    await this.db
      .delete(orgPublicationMap)
      .where(eq(orgPublicationMap.orgId, orgId));
  }

  async updateAvatar(orgId: string, avatarRelPath: string): Promise<void> {
    await this.db
      .update(organizations)
      .set({ avatar: avatarRelPath })
      .where(eq(organizations.id, orgId));
  }

  async listActiveMembers(
    orgId: string,
    perPage: number,
    offset: number
  ): Promise<OrgMemberRow[]> {
    return this.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        image: users.image,
        orcid: users.orcid,
        roles: orgUserMap.roles,
        startAt: orgUserMap.startAt,
        endAt: orgUserMap.endAt,
      })
      .from(orgUserMap)
      .innerJoin(users, eq(orgUserMap.userId, users.id))
      .where(and(eq(orgUserMap.orgId, orgId), activeMembership()))
      .orderBy(...alphabeticalMembers)
      .limit(perPage)
      .offset(offset);
  }

  async listMembersForAdmins(
    orgId: string,
    perPage: number,
    offset: number
  ): Promise<AdminOrgMemberRow[]> {
    return this.db
      .select(adminMemberColumns)
      .from(orgUserMap)
      .innerJoin(users, eq(orgUserMap.userId, users.id))
      .where(eq(orgUserMap.orgId, orgId))
      .orderBy(...alphabeticalMembers)
      .limit(perPage)
      .offset(offset);
  }

  async countActiveMembers(orgId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(orgUserMap)
      .innerJoin(users, eq(orgUserMap.userId, users.id))
      .where(and(eq(orgUserMap.orgId, orgId), activeMembership()));
    return row?.total ?? 0;
  }

  async countMembers(orgId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(orgUserMap)
      .innerJoin(users, eq(orgUserMap.userId, users.id))
      .where(eq(orgUserMap.orgId, orgId));
    return row?.total ?? 0;
  }

  async findMember(
    orgId: string,
    userId: string
  ): Promise<AdminOrgMemberRow | null> {
    const [row] = await this.db
      .select(adminMemberColumns)
      .from(orgUserMap)
      .innerJoin(users, eq(orgUserMap.userId, users.id))
      .where(and(eq(orgUserMap.orgId, orgId), eq(orgUserMap.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async canEdit(orgId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ state: users.state, orgUserId: orgUserMap.userId })
      .from(users)
      .leftJoin(
        orgUserMap,
        and(
          eq(orgUserMap.orgId, orgId),
          eq(orgUserMap.userId, userId),
          activeAdminMembership()
        )
      )
      .where(eq(users.id, userId))
      .limit(1);
    if (row?.state === "SITE_ADMIN") return true;
    return row?.orgUserId != null;
  }

  /**
   * Whether the user has a current (started, not ended) membership in any org
   * whose name is in `orgNames` — used to gate name-listed capabilities (e.g.
   * who may create publications) rather than a specific org id.
   */
  async hasMembershipInOrgs(
    userId: string,
    orgNames: string[]
  ): Promise<boolean> {
    if (orgNames.length === 0) return false;
    const [row] = await this.db
      .select({ one: sql<number>`1` })
      .from(orgUserMap)
      .innerJoin(organizations, eq(organizations.id, orgUserMap.orgId))
      .where(
        and(
          inArray(organizations.name, orgNames),
          eq(orgUserMap.userId, userId),
          currentMembership()
        )
      )
      .limit(1);
    return row != null;
  }

  /**
   * ACTIVE orgs the user holds an active ADMIN membership in, ordered by name.
   */
  async listAdministeredOrgs(userId: string): Promise<AdministeredOrgRow[]> {
    return await this.db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
      })
      .from(orgUserMap)
      .innerJoin(organizations, eq(organizations.id, orgUserMap.orgId))
      .where(
        and(
          eq(orgUserMap.userId, userId),
          activeAdminMembership(),
          eq(organizations.state, "ACTIVE")
        )
      )
      .orderBy(asc(organizations.name));
  }

  async existsMembership(orgId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ one: sql<number>`1` })
      .from(orgUserMap)
      .where(
        and(
          eq(orgUserMap.orgId, orgId),
          eq(orgUserMap.userId, userId),
          activeMembership()
        )
      )
      .limit(1);
    return row != null;
  }

  async createMember(fields: {
    orgId: string;
    userId: string;
    isAdmin: boolean;
    startAt: string | null;
    endAt: string | null;
  }): Promise<void> {
    await this.db.insert(orgUserMap).values(
      tf<typeof orgUserMap>({
        orgIdInt: null,
        orgId: fields.orgId,
        userIdInt: null,
        userId: fields.userId,
        roles: fields.isAdmin ? ["ADMIN"] : null,
        startAt: fields.startAt,
        endAt: fields.endAt,
      })
    );
  }

  async updateMember(
    orgId: string,
    userId: string,
    updates: Partial<{
      roles: ["ADMIN"] | null;
      startAt: string | null;
      endAt: string | null;
    }>
  ): Promise<void> {
    if (Object.keys(updates).length === 0) return;
    await this.db
      .update(orgUserMap)
      .set(updates)
      .where(and(eq(orgUserMap.orgId, orgId), eq(orgUserMap.userId, userId)));
  }

  async deleteMember(orgId: string, userId: string): Promise<void> {
    await this.db
      .delete(orgUserMap)
      .where(and(eq(orgUserMap.orgId, orgId), eq(orgUserMap.userId, userId)));
  }

  // Reimplements v0's `getPublicationsList` (backend-ts/src/api-v0/lib/rutils.ts)
  async listPublications(
    orgId: string,
    query: PaginationQueryRequest
  ): Promise<PaginatedResponseV1<OrgPublicationListRow>> {
    const { page, perPage, offset } = getPagination(query);

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          id: publications.id,
          slug: publications.slug,
          doi: publications.doi,
          title: versions.title,
          abstract: versions.abstract,
          createdAt: publications.createdAt,
          latestVersionNumber: publications.latestVersionNumber,
          subtitle: versions.subtitle,
          state: publications.state,
        })
        .from(publications)
        .innerJoin(
          versions,
          and(
            eq(versions.publicationId, publications.id),
            eq(versions.versionNumber, publications.latestVersionNumber)
          )
        )
        .innerJoin(
          orgPublicationMap,
          and(
            eq(orgPublicationMap.publicationId, publications.id),
            eq(orgPublicationMap.orgId, orgId)
          )
        )
        .where(
          and(
            eq(publications.state, "PUBLISHED"),
            eq(versions.state, "PUBLISHED")
          )
        )
        .orderBy(desc(publications.createdAt), desc(publications.id))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(publications)
        .innerJoin(
          versions,
          and(
            eq(versions.publicationId, publications.id),
            eq(versions.versionNumber, publications.latestVersionNumber)
          )
        )
        .innerJoin(
          orgPublicationMap,
          and(
            eq(orgPublicationMap.publicationId, publications.id),
            eq(orgPublicationMap.orgId, orgId)
          )
        )
        .where(
          and(
            eq(publications.state, "PUBLISHED"),
            eq(versions.state, "PUBLISHED")
          )
        ),
    ]);

    const publicationIds = rows.map((row) => row.id);
    const [contributorsByPub, orgsByPub, tagsByPub, commentCountsByPub] =
      await Promise.all([
        this.listPublicationsLatestContributors(publicationIds),
        this.listPublicationsOrgs(publicationIds),
        this.listPublicationsTags(publicationIds),
        this.getPublicationsCommentCounts(publicationIds),
      ]);

    const items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      doi: row.doi,
      title: row.title,
      subtitle: row.subtitle,
      abstract: row.abstract,
      createdAt: row.createdAt,
      numComments: commentCountsByPub.get(row.id) ?? 0,
      contributors: contributorsByPub.get(row.id) ?? [],
      orgs: orgsByPub.get(row.id) ?? [],
      tags: tagsByPub.get(row.id) ?? [],
      latestVersionNumber: row.latestVersionNumber,
      state: row.state,
    }));

    return {
      items,
      pagination: { total: totalRow?.total ?? 0, page, perPage },
    };
  }

  async listBySlug(slugs: Organization["slug"][]) {
    if (slugs.length === 0) return [];
    return await this.db.query.organizations.findMany({
      where: and(
        inArray(organizations.slug, slugs),
        not(eq(organizations.state, "DELETED"))
      ),
    });
  }

  async listById(orgIds: Organization["id"][]) {
    return await this.db.query.organizations.findMany({
      where: and(
        inArray(organizations.id, orgIds),
        not(eq(organizations.state, "DELETED"))
      ),
    });
  }

  async listAdmined(
    userId: Organization["id"],
    perPage: number,
    offset: number,
    sort?: AdminOrgListSort,
    isDesc = true
  ): Promise<AdminOrgWithPubAndMemberCounts[]> {
    const counts = this.adminCounts();

    return await this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        avatar: organizations.avatar,
        profile: organizations.profile,
        rorId: organizations.rorId,
        doiMintingEnabled: organizations.doiMintingEnabled,
        doiPrefix: organizations.doiPrefix,
        unlisted: organizations.unlisted,
        approved: organizations.approved,
        state: organizations.state,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        ...counts,
      })
      .from(organizations)
      .innerJoin(orgUserMap, eq(orgUserMap.orgId, organizations.id))
      .where(
        and(
          eq(orgUserMap.userId, userId),
          activeAdminMembership(),
          eq(organizations.state, "ACTIVE")
        )
      )
      .orderBy(...this.adminListOrder(sort, isDesc, counts))
      .limit(perPage)
      .offset(offset);
  }

  async countAdmined(
    userId: Organization["id"],
    { onlyUnlisted = false }: { onlyUnlisted?: boolean } = {}
  ) {
    const [row] = await this.db
      .select({ total: count() })
      .from(organizations)
      .innerJoin(orgUserMap, eq(orgUserMap.orgId, organizations.id))
      .where(
        and(
          eq(orgUserMap.userId, userId),
          activeAdminMembership(),
          eq(organizations.state, "ACTIVE"),
          ...(onlyUnlisted ? [eq(organizations.unlisted, true)] : [])
        )
      )
      .orderBy(desc(organizations.createdAt), desc(organizations.id));

    return row?.total ?? 0;
  }
}
