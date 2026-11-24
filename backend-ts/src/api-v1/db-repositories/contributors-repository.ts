import {
  type Contributor,
  type ContributorAffiliation,
  contributorAffiliations,
  contributors,
  type Organization,
  organizations,
  orgPublicationMap,
  orgUserMap,
  type User,
  users,
  type Version,
  versions,
} from "#src/db/schema.js";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { BaseRepository } from "./base-repository.js";
import { tf } from "./helpers/trigger-filled-map.js";

export type ContributorAffiliationRow = {
  orgId: ContributorAffiliation["affiliatedOrgId"];
  name: Organization["name"];
  slug: Organization["slug"];
  rorId: Organization["rorId"];
  avatar: Organization["avatar"];
};

export type ContributorRow = {
  userId: Contributor["userId"];
  roles: Contributor["roles"];
  username: User["username"];
  firstName: User["firstName"];
  lastName: User["lastName"];
  avatar: User["image"];
  inByline: Contributor["inByline"];
  priority: Contributor["priority"];
  affiliations: ContributorAffiliationRow[];
};

export type ListForDataciteAffiliation = {
  orgId: string;
  name: string;
  rorId: string | null;
};

export class ContributorsRepository extends BaseRepository {
  async listByVersionId(versionId: Version["id"]): Promise<ContributorRow[]> {
    const contribRows = await this.db
      .select({
        userId: contributors.userId,
        roles: contributors.roles,
        inByline: contributors.inByline,
        priority: contributors.priority,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        avatar: users.image,
      })
      .from(contributors)
      .innerJoin(users, eq(users.id, contributors.userId))
      .where(eq(contributors.versionId, versionId))
      .orderBy(
        sql`${contributors.priority} IS NULL`,
        asc(contributors.priority)
      );

    const affRows = await this.db
      .select({
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
      .where(eq(contributorAffiliations.versionId, versionId));

    const affiliationsByUser = new Map<string, ContributorAffiliationRow[]>();
    for (const { userId, ...affiliation } of affRows) {
      const list = affiliationsByUser.get(userId) ?? [];
      list.push(affiliation);
      affiliationsByUser.set(userId, list);
    }

    return contribRows.map((row) => ({
      ...row,
      inByline: Boolean(row.inByline),
      affiliations: affiliationsByUser.get(row.userId) ?? [],
    }));
  }

  async deleteManyFromVersion(
    versionId: Version["id"],
    userIds: User["id"][]
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const [result] = await this.db
      .delete(contributors)
      .where(
        and(
          eq(contributors.versionId, versionId),
          inArray(contributors.userId, userIds)
        )
      );
    return result.affectedRows;
  }

  async updateOnVersion(
    versionId: Version["id"],
    userId: User["id"],
    fields: { roles: string[]; inByline: boolean; priority: number }
  ): Promise<number> {
    const [result] = await this.db
      .update(contributors)
      .set(fields)
      .where(
        and(
          eq(contributors.versionId, versionId),
          eq(contributors.userId, userId)
        )
      );
    return result.affectedRows;
  }

  async createMany(
    versionId: Version["id"],
    entries: Array<{
      userId: User["id"];
      roles: string[];
      priority: number;
      inByline: boolean;
    }>
  ) {
    if (entries.length === 0) return;
    await this.db.insert(contributors).values(
      tf<typeof contributors>(
        entries.map((e) => ({
          versionId,
          versionIdInt: null,
          userId: e.userId,
          userIdInt: null,
          roles: e.roles,
          priority: e.priority,
          inByline: e.inByline,
        }))
      )
    );
  }

  async deleteAffiliations(
    versionId: Version["id"],
    userId: User["id"],
    orgIds: string[]
  ) {
    if (orgIds.length === 0) return;
    await this.db
      .delete(contributorAffiliations)
      .where(
        and(
          eq(contributorAffiliations.versionId, versionId),
          eq(contributorAffiliations.userId, userId),
          inArray(contributorAffiliations.affiliatedOrgId, orgIds)
        )
      );
  }

  async deleteAllAffiliations(versionId: Version["id"], userIds: User["id"][]) {
    if (userIds.length === 0) return 0;
    const [result] = await this.db
      .delete(contributorAffiliations)
      .where(
        and(
          eq(contributorAffiliations.versionId, versionId),
          inArray(contributorAffiliations.userId, userIds)
        )
      );
    return result.affectedRows;
  }

  async createAffiliations(
    versionId: Version["id"],
    userId: User["id"],
    orgIds: string[]
  ) {
    if (orgIds.length === 0) return;
    await this.db.insert(contributorAffiliations).values(
      tf<typeof contributorAffiliations>(
        orgIds.map((affiliatedOrgId) => ({
          id: null,
          versionId,
          versionIdInt: null,
          userId,
          userIdInt: null,
          affiliatedOrgId,
          affiliatedOrgIdInt: null,
        }))
      )
    );
  }

  async listForDatacite(publicationId: string, versionId: string) {
    const priority = sql<number>`COALESCE(${contributors.priority}, 999999)`.as(
      "priority"
    );

    const rows = await this.db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        orcid: users.orcid,
        inByline: contributors.inByline,
        priority,
      })
      .from(contributors)
      .innerJoin(users, eq(users.id, contributors.userId))
      .where(eq(contributors.versionId, versionId))
      .orderBy(priority, users.lastName, users.firstName);

    // Explicit affiliations recorded for this version
    const explicitAffiliations = this.db
      .select({
        userId: contributorAffiliations.userId,
        orgId: organizations.id,
        name: organizations.name,
        rorId: organizations.rorId,
      })
      .from(contributorAffiliations)
      .innerJoin(
        organizations,
        eq(organizations.id, contributorAffiliations.affiliatedOrgId)
      )
      .where(eq(contributorAffiliations.versionId, versionId));

    const affiliations = await explicitAffiliations.union(
      this.currentOrgAffiliations(
        publicationId,
        rows.map((row) => row.userId)
      )
    );
    return withDataciteAffiliations(rows, affiliations);
  }

  /**
   * Every contributor across the publication's published versions, merged
   * per user: in the byline if they were on any version, at the highest
   * billing (lowest `priority`) they were ever given.
   */
  async listAllPublishedForDatacite(publicationId: string) {
    const isPublishedVersionOf = (versionId: AnyMySqlColumn) =>
      and(
        eq(versions.id, versionId),
        eq(versions.publicationId, publicationId),
        eq(versions.state, "PUBLISHED")
      );

    const priority =
      sql<number>`COALESCE(MIN(${contributors.priority}), 999999)`.as(
        "priority"
      );

    const rows = await this.db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        orcid: users.orcid,
        inByline: sql<number | null>`MAX(${contributors.inByline})`,
        priority,
      })
      .from(contributors)
      .innerJoin(versions, isPublishedVersionOf(contributors.versionId))
      .innerJoin(users, eq(users.id, contributors.userId))
      .groupBy(users.id, users.firstName, users.lastName, users.orcid)
      .orderBy(priority, users.lastName, users.firstName);

    // Explicit affiliations recorded on any published version
    const explicitAffiliations = this.db
      .select({
        userId: contributorAffiliations.userId,
        orgId: organizations.id,
        name: organizations.name,
        rorId: organizations.rorId,
      })
      .from(contributorAffiliations)
      .innerJoin(
        versions,
        isPublishedVersionOf(contributorAffiliations.versionId)
      )
      .innerJoin(
        organizations,
        eq(organizations.id, contributorAffiliations.affiliatedOrgId)
      );

    const affiliations = await explicitAffiliations.union(
      this.currentOrgAffiliations(
        publicationId,
        rows.map((row) => row.userId)
      )
    );
    return withDataciteAffiliations(rows, affiliations);
  }

  // Current memberships of `userIds` in orgs linked to this publication
  private currentOrgAffiliations(publicationId: string, userIds: string[]) {
    return this.db
      .select({
        userId: orgUserMap.userId,
        orgId: organizations.id,
        name: organizations.name,
        rorId: organizations.rorId,
      })
      .from(orgUserMap)
      .innerJoin(
        orgPublicationMap,
        and(
          eq(orgPublicationMap.orgId, orgUserMap.orgId),
          eq(orgPublicationMap.publicationId, publicationId)
        )
      )
      .innerJoin(organizations, eq(organizations.id, orgUserMap.orgId))
      .where(
        and(
          inArray(orgUserMap.userId, userIds),
          or(isNull(orgUserMap.endAt), gt(orgUserMap.endAt, sql`NOW()`))
        )
      );
  }
}

/**
 * `UNION` is distinct, so an org listed on several versions, or both listed
 * and a current membership, is already a single row here.
 */
function withDataciteAffiliations<
  T extends { userId: string; inByline: boolean | number | null },
>(
  rows: T[],
  affiliationRows: Array<ListForDataciteAffiliation & { userId: string }>
): Array<
  Omit<T, "userId" | "inByline"> & {
    inByline: boolean;
    affiliations: ListForDataciteAffiliation[];
  }
> {
  const affiliationsByUser = new Map<string, ListForDataciteAffiliation[]>();
  for (const { userId, ...affiliation } of affiliationRows) {
    const list = affiliationsByUser.get(userId) ?? [];
    list.push(affiliation);
    affiliationsByUser.set(userId, list);
  }

  return rows.map(({ userId, inByline, ...row }) => ({
    ...row,
    inByline: Boolean(inByline),
    affiliations: (affiliationsByUser.get(userId) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  }));
}
