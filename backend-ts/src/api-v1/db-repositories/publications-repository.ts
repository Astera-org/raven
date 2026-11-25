import {
  comments,
  contributors,
  linkedAssets,
  organizations,
  orgPublicationMap,
  orgUserMap,
  publications,
  publicationTags,
  references,
  users,
  versionReferences,
  versions,
  type DoiMetadataSubject,
  type Organization,
  type OrgPublicationConnectionInsert,
  type Publication,
  type PublicationInsert,
  type PublicationState,
  type PublicationUpdate,
  type Version,
} from "#src/db/schema.js";
import { escapeLike } from "#src/lib/utils/escape-like.js";
import { getPagination } from "#src/lib/utils/get-pagination.js";
import { type PaginationQueryRequest } from "#v1/lib/route-requests/pagination.js";
import { type PaginatedResponseV1 } from "#v1/lib/route-responses/pagination.js";
import { type DoiComparisonType } from "#v1/routes/admin/doi-audits/route-requests/get-doi-comparison.js";
import { type AdminScope } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { type AdminPublicationStateFilter } from "#v1/routes/admin/publications/route-requests/get-admin-publication-list.js";
import {
  type PublicationListItemResponse,
  type PublicationListOrgResponse,
} from "#v1/routes/publications/route-responses/publication-list-item.js";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  like,
  ne,
  not,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { BaseRepository } from "./base-repository.js";
import { adminCurrentVersion } from "./helpers/admin-current-version.js";
import {
  activeAdminMembership,
  activeMembership,
} from "./helpers/org-membership.js";
import { tf, type TriggerFilled } from "./helpers/trigger-filled-map.js";

export type OwnedPublicationState = "draft" | "published";

export type OwnedPublicationListItemRow = {
  publicationId: Publication["id"];
  slug: Publication["slug"];
  state: Publication["state"];
  versionId: Version["id"];
  versionNumber: Version["versionNumber"];
  title: Version["title"];
  createdAt: Publication["createdAt"];
  updatedAt: Version["updatedAt"];
};

/**
 * `idInt` is only for the integer-keyed metadata reconstruction and DataCite
 * calls a DOI audit makes; it never reaches a response. This is the
 * api-versioning skill's exception for shared int-keyed subsystems, the same
 * way `post-doi.ts` passes `publication.idInt` to the DataCite client.
 */
export type DoiAuditPublicationRow = {
  id: Publication["id"];
  idInt: Publication["idInt"];
  slug: Publication["slug"];
  doi: Publication["doi"];
  license: Publication["license"];
  doiMetadata: Publication["doiMetadata"];
};

const ADMIN_STATE_FILTER_STATES: Record<
  AdminPublicationStateFilter,
  Publication["state"][]
> = {
  all: ["DRAFT", "PUBLISHED", "DELETED"],
  published: ["PUBLISHED"],
  draft: ["DRAFT"],
  removed: ["DELETED"],
};

export type FindPublicationOptions = {
  includeDeleted?: boolean;
};

export class PublicationsRepository extends BaseRepository {
  async create(fields: TriggerFilled<typeof publications>): Promise<void> {
    await this.db.insert(publications).values(fields as PublicationInsert);
  }

  async createOrgs(
    publicationId: string,
    orgs: Omit<
      OrgPublicationConnectionInsert,
      "publicationId" | "publicationIdInt" | "orgIdInt"
    >[]
  ) {
    if (orgs.length === 0) return;
    await this.db.insert(orgPublicationMap).values(
      tf<typeof orgPublicationMap>(
        orgs.map((o) => ({
          ...o,
          publicationId,
          publicationIdInt: null,
          orgIdInt: null,
        }))
      )
    );
  }

  async findById(
    publicationId: string,
    { includeDeleted = true }: FindPublicationOptions = {}
  ): Promise<Publication | undefined> {
    return this.db.query.publications.findFirst({
      /** @todo don't return integer id columns */
      // columns: { idInt: false, ownerIdInt: false },
      where: includeDeleted
        ? eq(publications.id, publicationId)
        : and(
            eq(publications.id, publicationId),
            not(eq(publications.state, "DELETED"))
          ),
    });
  }

  async findForUpdate(publicationId: string): Promise<Publication | undefined> {
    const [row] = await this.db
      .select()
      .from(publications)
      .where(eq(publications.id, publicationId))
      .for("update");
    return row;
  }

  async findBySlug(
    slug: string,
    { includeDeleted = true }: FindPublicationOptions = {}
  ): Promise<Publication | undefined> {
    return this.db.query.publications.findFirst({
      /** @todo don't return integer id columns */
      // columns: { idInt: false, ownerIdInt: false },
      where: includeDeleted
        ? eq(publications.slug, slug)
        : and(
            eq(publications.slug, slug),
            not(eq(publications.state, "DELETED"))
          ),
    });
  }

  /** Includes deleted publications, since `publications.doi` is unique. */
  async isDoiTaken(doi: string): Promise<boolean> {
    const row = await this.db.query.publications.findFirst({
      columns: { id: true },
      where: eq(publications.doi, doi),
    });
    return row !== undefined;
  }

  /** Includes deleted publications, since their slugs stay reserved. */
  async listSlugsWithPrefix(prefix: string): Promise<string[]> {
    const rows = await this.db
      .select({ slug: publications.slug })
      .from(publications)
      .where(like(publications.slug, `${escapeLike(prefix)}%`));
    return rows.map((row) => row.slug);
  }

  async list(
    filters: {
      pagination?: PaginationQueryRequest;
      searchTerm?: string;
      tags?: string[];
    } = {}
  ): Promise<PaginatedResponseV1<PublicationListItemResponse>> {
    const versionsJoin = [
      versions,
      and(
        eq(versions.publicationId, publications.id),
        eq(versions.versionNumber, publications.latestVersionNumber)
      ),
    ] as const;
    let query = this.db
      .select({
        id: publications.id,
        slug: publications.slug,
        doi: publications.doi,
        state: publications.state,
        versionNumber: publications.latestVersionNumber,
        title: versions.title,
        abstract: versions.abstract,
        createdAt: publications.createdAt,
      })
      .from(publications)
      .innerJoin(...versionsJoin);
    let totalQuery = this.db
      .select({ total: count() })
      .from(publications)
      .innerJoin(...versionsJoin);
    // This list is public, so it must only ever show published work: never a
    // draft or deleted publication, and never an unpublished version (whose
    // body the `searchTerm` full-text match would otherwise search). Mirrors
    // v0's `getPublicationsList`.
    const where: (SQL | undefined)[] = [
      eq(publications.state, "PUBLISHED"),
      eq(versions.state, "PUBLISHED"),
    ];

    if (filters.tags && filters.tags.length > 0) {
      const joinArgs = [
        publicationTags,
        eq(publicationTags.publicationId, publications.id),
      ] as const;
      query = query.innerJoin(...joinArgs);
      totalQuery = totalQuery.innerJoin(...joinArgs);

      where.push(inArray(publicationTags.tag, filters.tags));
    }

    if (filters.searchTerm) {
      const likePattern = `%${escapeLike(filters.searchTerm.toLowerCase())}%`;
      where.push(
        or(
          sql`MATCH(${versions.title}, ${versions.abstract}, ${versions.body}) AGAINST (${filters.searchTerm} IN BOOLEAN MODE)`,
          exists(
            this.db
              .select({ one: sql<number>`1` })
              .from(contributors)
              .innerJoin(users, eq(users.id, contributors.userId))
              .where(
                and(
                  eq(contributors.versionId, versions.id),
                  or(
                    like(sql`LOWER(${users.firstName})`, likePattern),
                    like(sql`LOWER(${users.lastName})`, likePattern),
                    like(
                      sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName}))`,
                      likePattern
                    )
                  )
                )
              )
          )
        )
      );
    }

    const { page, perPage, offset } = getPagination(filters.pagination ?? {});

    const items = await query
      .where(and(...where))
      .orderBy(desc(publications.createdAt), desc(publications.id))
      .limit(perPage)
      .offset(offset);

    const [total] = await totalQuery.where(and(...where));

    return {
      pagination: { page, perPage, total: total?.total ?? 0 },
      items: await Promise.all(
        items.map(async (pub) => {
          return {
            ...pub,
            orgs: (await this.listOrgs(pub.id, true)).map(
              (o): PublicationListOrgResponse => {
                return {
                  orgId: o.organization.id,
                  slug: o.organization.slug,
                  name: o.organization.name,
                  avatar: o.organization.avatar,
                  priority: o.priority,
                };
              }
            ),
            contributors: await this.listContributors(pub.id),
            tags: await this.listTags(pub.id),
            commentsCount: await this.countComments(pub.id),
          };
        })
      ),
    };
  }

  /**
   * A `site` scope lists every publication; an `org` scope only those linked
   * to an org the user is an active ADMIN of. `orgId` further narrows the list
   * to publications linked to that org, and `userId` to publications that user
   * owns or contributes to.
   */
  async listAdministered(filters: {
    scope: AdminScope;
    state: AdminPublicationStateFilter;
    searchTerm?: string | undefined;
    orgId?: string;
    userId?: string;
    pagination: PaginationQueryRequest;
  }): Promise<PaginatedResponseV1<PublicationListItemResponse>> {
    const { page, perPage, offset } = getPagination(filters.pagination);

    const where: (SQL | undefined)[] = [
      inArray(publications.state, ADMIN_STATE_FILTER_STATES[filters.state]),
    ];

    if (filters.searchTerm) {
      const pattern = `%${escapeLike(filters.searchTerm)}%`;
      where.push(
        or(like(versions.title, pattern), like(publications.slug, pattern))
      );
    }

    if (filters.scope.kind === "org") {
      where.push(this.linkedToOrgs(filters.scope.orgs));
    }

    if (filters.orgId) {
      where.push(this.linkedToOrgs([{ id: filters.orgId }]));
    }

    if (filters.userId) {
      where.push(this.ownedOrContributedBy(filters.userId));
    }

    const whereClause = and(...where);
    const currentVersion = adminCurrentVersion(this.db);

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          id: publications.id,
          slug: publications.slug,
          doi: publications.doi,
          state: publications.state,
          versionId: versions.id,
          versionNumber: versions.versionNumber,
          title: versions.title,
          abstract: versions.abstract,
          createdAt: publications.createdAt,
        })
        .from(publications)
        .innerJoin(versions, currentVersion)
        .where(whereClause)
        .orderBy(desc(publications.createdAt), desc(publications.id))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(publications)
        .innerJoin(versions, currentVersion)
        .where(whereClause),
    ]);

    const publicationIds = rows.map((row) => row.id);
    const [relatedByPub, contributorsByVersion, commentCountsByPub] =
      await Promise.all([
        this.listRelatedRowsForPublications(publicationIds),
        this.listContributorsForVersions(rows.map((row) => row.versionId)),
        this.countCommentsForPublications(publicationIds),
      ]);

    return {
      pagination: { total: totalRow?.total ?? 0, page, perPage },
      items: rows.map(({ versionId, ...row }) => {
        const related = relatedByPub.get(row.id);
        return {
          ...row,
          contributors: contributorsByVersion.get(versionId) ?? [],
          orgs: related?.orgs ?? [],
          tags: related?.tags ?? [],
          commentsCount: commentCountsByPub.get(row.id) ?? 0,
        };
      }),
    };
  }

  /**
   * Matches publications linked to one of the orgs. Admin routes pass the
   * scope's orgs, which `requireAdminScope` already resolved to the user's
   * active ADMIN memberships.
   */
  private linkedToOrgs(orgs: { id: string }[]): SQL {
    return exists(
      this.db
        .select({ one: sql<number>`1` })
        .from(orgPublicationMap)
        .where(
          and(
            eq(orgPublicationMap.publicationId, publications.id),
            inArray(
              orgPublicationMap.orgId,
              orgs.map((org) => org.id)
            )
          )
        )
    );
  }

  /** Matches publications the user owns or is a contributor on any version of. */
  private ownedOrContributedBy(userId: string): SQL | undefined {
    const contributedVersions = alias(versions, "contributed_versions");
    return or(
      eq(publications.ownerId, userId),
      exists(
        this.db
          .select({ one: sql<number>`1` })
          .from(contributors)
          .innerJoin(
            contributedVersions,
            eq(contributedVersions.id, contributors.versionId)
          )
          .where(
            and(
              eq(contributedVersions.publicationId, publications.id),
              eq(contributors.userId, userId)
            )
          )
      )
    );
  }

  /**
   * Finds a publication by id or slug within the scope, with the version the
   * admin list serves for it, where a `site` scope administers every
   * publication and an `org` scope only those linked to an org the user is an
   * active ADMIN of. An id match wins over a slug match.
   */
  async findAdministered(
    scope: AdminScope,
    idOrSlug: string
  ): Promise<{ publication: Publication; version: Version } | undefined> {
    const [row] = await this.db
      .select({ publication: publications, version: versions })
      .from(publications)
      .innerJoin(versions, adminCurrentVersion(this.db))
      .where(
        and(
          or(eq(publications.id, idOrSlug), eq(publications.slug, idOrSlug)),
          scope.kind === "org" ? this.linkedToOrgs(scope.orgs) : undefined
        )
      )
      .orderBy(desc(eq(publications.id, idOrSlug)), desc(versions.createdAt))
      .limit(1);
    return row;
  }

  /**
   * The publications a DOI audit run covers within the scope: `PUBLISHED`
   * ones with a canonical DOI.
   */
  async listAdministeredWithDoi(
    scope: AdminScope
  ): Promise<DoiAuditPublicationRow[]> {
    return await this.db
      .select({
        id: publications.id,
        idInt: publications.idInt,
        slug: publications.slug,
        doi: publications.doi,
        license: publications.license,
        doiMetadata: publications.doiMetadata,
      })
      .from(publications)
      .where(
        and(
          eq(publications.state, "PUBLISHED"),
          isNotNull(publications.doi),
          scope.kind === "org" ? this.linkedToOrgs(scope.orgs) : undefined
        )
      )
      .orderBy(asc(publications.id));
  }

  /**
   * Finds the publication a DOI belongs to within the scope: its canonical DOI,
   * or a published version's DOI. Wider than an audit run's PUBLISHED-only
   * selection: a removed publication's DOI stays registered (hidden), so its
   * record can still drift and be compared.
   */
  async findAdministeredByDoi(
    scope: AdminScope,
    type: DoiComparisonType,
    doi: string
  ): Promise<DoiAuditPublicationRow | null> {
    const hasDoi =
      type === "canonical"
        ? eq(publications.doi, doi)
        : exists(
            this.db
              .select({ one: sql<number>`1` })
              .from(versions)
              .where(
                and(
                  eq(versions.publicationId, publications.id),
                  eq(versions.doi, doi),
                  eq(versions.state, "PUBLISHED")
                )
              )
          );
    const [row] = await this.db
      .select({
        id: publications.id,
        idInt: publications.idInt,
        slug: publications.slug,
        doi: publications.doi,
        license: publications.license,
        doiMetadata: publications.doiMetadata,
      })
      .from(publications)
      .where(
        and(
          hasDoi,
          inArray(publications.state, ["PUBLISHED", "DELETED"]),
          scope.kind === "org" ? this.linkedToOrgs(scope.orgs) : undefined
        )
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * The publication's primary org: org_publication_map is many-to-many, and the
   * lowest priority comes first.
   */
  async findPrimaryOrg(
    publicationId: Publication["id"]
  ): Promise<Pick<Organization, "name"> | null> {
    const [row] = await this.db
      .select({ name: organizations.name })
      .from(orgPublicationMap)
      .innerJoin(organizations, eq(organizations.id, orgPublicationMap.orgId))
      .where(eq(orgPublicationMap.publicationId, publicationId))
      .orderBy(asc(orgPublicationMap.priority))
      .limit(1);
    return row ?? null;
  }

  /**
   * The subset of `publicationIds` the scope administers now, in any state.
   * A `site` scope administers every publication, so it needs no query.
   */
  async listAdministeredIds(
    scope: AdminScope,
    publicationIds: Publication["id"][]
  ): Promise<Publication["id"][]> {
    if (scope.kind === "site" || publicationIds.length === 0) {
      return publicationIds;
    }
    const rows = await this.db
      .select({ id: publications.id })
      .from(publications)
      .where(
        and(
          inArray(publications.id, publicationIds),
          this.linkedToOrgs(scope.orgs)
        )
      );
    return rows.map((row) => row.id);
  }

  private async listRelatedRowsForPublications(
    publicationIds: string[]
  ): Promise<Map<string, Pick<PublicationListItemResponse, "orgs" | "tags">>> {
    if (publicationIds.length === 0) return new Map();

    const rows = await this.db.query.publications.findMany({
      columns: { id: true },
      where: inArray(publications.id, publicationIds),
      with: {
        orgPublicationMaps: {
          columns: { orgId: true, priority: true },
          with: {
            organization: { columns: { slug: true, name: true, avatar: true } },
          },
        },
        publicationTags: { columns: { tag: true } },
      },
    });

    return new Map(
      rows.map((pub) => [
        pub.id,
        {
          // MySQL's JSON_ARRAYAGG doesn't guarantee element order, so a
          // nested `orderBy` can't be relied on; sort here, nulls first like
          // MySQL's ascending ORDER BY.
          orgs: pub.orgPublicationMaps
            .map(({ orgId, priority, organization }) => ({
              orgId,
              priority,
              ...organization,
            }))
            .sort(
              (a, b) =>
                (a.priority ?? Number.MIN_SAFE_INTEGER) -
                (b.priority ?? Number.MIN_SAFE_INTEGER)
            ),
          tags: pub.publicationTags.map(({ tag }) => tag),
        },
      ])
    );
  }

  private async listContributorsForVersions(
    versionIds: string[]
  ): Promise<Map<string, PublicationListItemResponse["contributors"]>> {
    if (versionIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        versionId: contributors.versionId,
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        avatar: users.image,
      })
      .from(contributors)
      .innerJoin(users, eq(users.id, contributors.userId))
      .where(inArray(contributors.versionId, versionIds))
      .orderBy(
        sql`${contributors.priority} IS NULL`,
        asc(contributors.priority)
      );

    const byVersion = new Map<
      string,
      PublicationListItemResponse["contributors"]
    >();
    for (const { versionId, ...contributor } of rows) {
      const list = byVersion.get(versionId) ?? [];
      list.push(contributor);
      byVersion.set(versionId, list);
    }
    return byVersion;
  }

  private async countCommentsForPublications(
    publicationIds: string[]
  ): Promise<Map<string, number>> {
    if (publicationIds.length === 0) return new Map();

    const rows = await this.db
      .select({ publicationId: comments.publicationId, total: count() })
      .from(comments)
      .where(inArray(comments.publicationId, publicationIds))
      .groupBy(comments.publicationId);

    return new Map(
      publicationIds.map((id) => [
        id,
        rows.find((row) => row.publicationId === id)?.total ?? 0,
      ])
    );
  }

  async countComments(publicationId: string) {
    return (
      (
        await this.db
          .select({ total: count() })
          .from(comments)
          .where(eq(comments.publicationId, publicationId))
      )[0]?.total ?? 0
    );
  }

  /** The contributors on the publication's latest version. */
  async listContributors(publicationId: string) {
    return await this.db
      .select({
        userId: users.id,
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
      .where(eq(publications.id, publicationId))
      .orderBy(
        sql`${contributors.priority} IS NULL`,
        asc(contributors.priority)
      );
  }

  async canEdit(
    userId: string,
    publicationId: string,
    ownerId: string | null
  ): Promise<boolean> {
    if (!userId || !publicationId) return false;

    /**
     * This is intentional, the owner of a pub should always be able to edit.
     *
     * @todo once we have more explicity permissions, there could be a case
     * where an owner loses edit access, but for now that is not the case.
     */
    if (ownerId === userId) return true;

    return this.isMemberOfAttachedOrg(userId, publicationId, {
      requireAdmin: true,
    });
  }

  /**
   * Narrower than `canEdit`: the owner can publish a publication that isn't
   * attached to any org, or one attached to an org they're a current member
   * of; anyone else must be an `ADMIN` of one of its orgs.
   */
  async canPublish(
    userId: string,
    publicationId: string,
    ownerId: string | null
  ): Promise<boolean> {
    if (!userId || !publicationId) return false;

    if (ownerId === userId) {
      const [orgRow] = await this.db
        .select({ one: sql<number>`1` })
        .from(orgPublicationMap)
        .where(eq(orgPublicationMap.publicationId, publicationId))
        .limit(1);
      if (orgRow == null) return true;

      return this.isMemberOfAttachedOrg(userId, publicationId, {
        requireAdmin: false,
        includeDeleted: true,
      });
    }

    return this.isMemberOfAttachedOrg(userId, publicationId, {
      requireAdmin: true,
    });
  }

  /**
   * Both ids are ULIDs resolved from the request/session; the `end_at`
   * membership window and optional `ADMIN` role check happen against
   * `org_user_map`, whose legacy int columns are irrelevant here since it's
   * joined to `org_publication_map` entirely by the string `org_id`.
   */
  private async isMemberOfAttachedOrg(
    userId: string,
    publicationId: string,
    {
      requireAdmin,
      includeDeleted = false,
    }: { requireAdmin: boolean; includeDeleted?: boolean }
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ one: sql<number>`1` })
      .from(orgPublicationMap)
      .innerJoin(orgUserMap, eq(orgUserMap.orgId, orgPublicationMap.orgId))
      .innerJoin(
        publications,
        and(
          eq(publications.id, orgPublicationMap.publicationId),
          includeDeleted ? undefined : not(eq(publications.state, "DELETED"))
        )
      )
      .where(
        and(
          eq(orgPublicationMap.publicationId, publicationId),
          eq(orgUserMap.userId, userId),
          requireAdmin ? activeAdminMembership() : activeMembership()
        )
      )
      .limit(1);
    return row != null;
  }

  /**
   * Broader than `canEdit`: a contributor, a site admin, or (when the
   * publication isn't attached to any org yet) its owner can view an
   * unpublished draft even without edit rights.
   */
  async canViewDraft(
    userId: string | null,
    publicationId: string,
    ownerId: string | null
  ): Promise<boolean> {
    if (!userId || !publicationId) return false;

    /**
     * This is intentional, the owner of a pub should always be able to view.
     *
     * @todo once we have more explicity permissions, there could be a case
     * where an owner loses view access, but for now that is not the case.
     */
    if (ownerId === userId) return true;

    const [[isContributor], [isSiteAdmin], orgPubRows] = await Promise.all([
      // Contributors are version-scoped, so this is contributorship on the
      // draft being viewed, not on the publication's published versions.
      this.db
        .select({ one: sql<number>`1` })
        .from(contributors)
        .innerJoin(versions, eq(versions.id, contributors.versionId))
        .where(
          and(
            eq(versions.publicationId, publicationId),
            eq(versions.state, "DRAFT"),
            eq(contributors.userId, userId)
          )
        )
        .limit(1),
      this.db
        .select({ one: sql<number>`1` })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.state, "SITE_ADMIN")))
        .limit(1),
      this.db
        .select({ one: sql<number>`1` })
        .from(orgPublicationMap)
        .where(eq(orgPublicationMap.publicationId, publicationId))
        .limit(1),
    ]);
    if (isContributor) return true;
    if (isSiteAdmin) return true;

    if (orgPubRows.length === 0) return ownerId !== null && userId === ownerId;

    const [row] = await this.db
      .select({ one: sql<number>`1` })
      .from(orgPublicationMap)
      .innerJoin(orgUserMap, eq(orgUserMap.orgId, orgPublicationMap.orgId))
      .where(
        and(
          eq(orgPublicationMap.publicationId, publicationId),
          eq(orgUserMap.userId, userId),
          activeMembership()
        )
      )
      .limit(1);
    return row != null;
  }

  /**
   * Non-deleted publications the given user owns, each paired with its newest
   * non-deleted version (its draft, if it has one). `draft` matches
   * publications with a draft version, including published ones with a
   * pending new version; `published` matches publications that have been
   * published.
   */
  async listForOwner(
    ownerId: string,
    {
      state,
      pagination,
    }: { state?: OwnedPublicationState; pagination?: PaginationQueryRequest }
  ): Promise<PaginatedResponseV1<OwnedPublicationListItemRow>> {
    const { page, perPage, offset } = getPagination(pagination ?? {});
    const newerVersions = alias(versions, "newer_versions");
    const stateFilters = {
      draft: eq(versions.state, "DRAFT"),
      published: eq(publications.state, "PUBLISHED"),
    };
    const whereClause = and(
      eq(publications.ownerId, ownerId),
      ne(publications.state, "DELETED"),
      ne(versions.state, "DELETED"),
      notExists(
        this.db
          .select({ one: sql<number>`1` })
          .from(newerVersions)
          .where(
            and(
              eq(newerVersions.publicationId, versions.publicationId),
              ne(newerVersions.state, "DELETED"),
              gt(newerVersions.versionNumber, versions.versionNumber)
            )
          )
      ),
      state ? stateFilters[state] : undefined
    );

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select({
          publicationId: publications.id,
          slug: publications.slug,
          state: publications.state,
          versionId: versions.id,
          versionNumber: versions.versionNumber,
          title: versions.title,
          createdAt: publications.createdAt,
          updatedAt: versions.updatedAt,
        })
        .from(publications)
        .innerJoin(versions, eq(versions.publicationId, publications.id))
        .where(whereClause)
        .orderBy(desc(publications.createdAt), desc(publications.id))
        .limit(perPage)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(publications)
        .innerJoin(versions, eq(versions.publicationId, publications.id))
        .where(whereClause),
    ]);

    return {
      items,
      pagination: { total: totalRow?.total ?? 0, page, perPage },
    };
  }

  async listOrgs<T extends boolean = boolean>(
    publicationId: string,
    withOrgData?: T
  ) {
    const orgs = this.db.query.orgPublicationMap.findMany<{
      columns: { orgIdInt: false; publicationIdInt: false };
      with: {
        organization: T extends false
          ? undefined
          : { columns: { idInt: false } };
      };
      where: SQL;
    }>({
      columns: { orgIdInt: false, publicationIdInt: false },
      with: {
        organization: (withOrgData === false
          ? undefined
          : { columns: { idInt: false } }) as T extends false
          ? undefined
          : { columns: { idInt: false } },
      },
      where: eq(orgPublicationMap.publicationId, publicationId),
    });
    return orgs;
  }

  async deleteOrgs(publicationId: string, orgsIds: string[]) {
    await this.db
      .delete(orgPublicationMap)
      .where(
        and(
          eq(orgPublicationMap.publicationId, publicationId),
          inArray(orgPublicationMap.orgId, orgsIds)
        )
      );
  }

  async update(
    publicationId: string,
    update: Omit<PublicationUpdate, "state">
  ) {
    await this.db
      .update(publications)
      .set(update)
      .where(eq(publications.id, publicationId));
  }

  /**
   * Replaces only `content.subjects` in the publication's DOI metadata, in one
   * statement, so a concurrent change to its language or types isn't lost.
   * Only writes while the publication is a `DRAFT`, checked in the same
   * statement so one published since the caller loaded it isn't changed.
   * Returns false when nothing matched: the publication isn't a draft, or its
   * metadata has a type other than `datacite`, with no `content.subjects`.
   */
  async updateDoiMetadataSubjects(
    publicationId: string,
    subjects: DoiMetadataSubject[]
  ) {
    const [result] = await this.db
      .update(publications)
      .set({
        doiMetadata: sql`JSON_SET(${publications.doiMetadata}, '$.content.subjects', CAST(${JSON.stringify(subjects)} AS JSON))`,
      })
      .where(
        and(
          eq(publications.id, publicationId),
          eq(publications.state, "DRAFT"),
          sql`${publications.doiMetadata}->>'$.type' = 'datacite'`
        )
      );

    return result.affectedRows > 0;
  }

  async updateOrgPriority(
    publicationId: string,
    orgId: string,
    priority: number
  ) {
    const [result] = await this.db
      .update(orgPublicationMap)
      .set({
        priority,
      })
      .where(
        and(
          eq(orgPublicationMap.orgId, orgId),
          eq(orgPublicationMap.publicationId, publicationId),
          sql`EXISTS (SELECT 1 FROM publications p WHERE p.id = ${publicationId} AND p.state <> 'DELETED')`
        )
      );

    return result.affectedRows > 0;
  }

  async updateState(publicationId: string, newState: PublicationState) {
    const [result] = await this.db
      .update(publications)
      .set({ state: newState })
      .where(eq(publications.id, publicationId));

    return result.affectedRows > 0;
  }

  /**
   * Permanently removes a publication and everything attached to it. Comments
   * and versions are deleted explicitly because their foreign keys restrict;
   * the rest (contributors, org mappings, tags, affiliations, references,
   * linked assets, notifications) cascade. Run inside a transaction.
   */
  async delete(publicationId: string): Promise<void> {
    const pub = await this.db.query.publications.findFirst({
      columns: { idInt: true },
      where: eq(publications.id, publicationId),
    });
    if (!pub) return;

    // Legacy rows may only carry the int foreign key, and both columns
    // restrict, so match on either.
    await this.db
      .delete(comments)
      .where(
        or(
          eq(comments.publicationId, publicationId),
          eq(comments.publicationIdInt, pub.idInt)
        )
      );
    await this.db
      .delete(versions)
      .where(
        or(
          eq(versions.publicationId, publicationId),
          eq(versions.publicationIdInt, pub.idInt)
        )
      );
    await this.db
      .delete(publications)
      .where(eq(publications.id, publicationId));
  }

  async createManyTags(publicationId: string, tags: string[]) {
    if (tags.length === 0) return;
    await this.db.insert(publicationTags).values(
      tf<typeof publicationTags>(
        tags.map((tag) => ({
          publicationId,
          publicationIdInt: null,
          tag,
        }))
      )
    );
  }

  async deleteManyTags(publicationId: string, tags: string[]) {
    await this.db
      .delete(publicationTags)
      .where(
        and(
          eq(publicationTags.publicationId, publicationId),
          inArray(publicationTags.tag, tags)
        )
      );
  }

  async findDoiMetadata(
    publicationId: string
  ): Promise<Publication["doiMetadata"] | undefined> {
    const [row] = await this.db
      .select({ doiMetadata: publications.doiMetadata })
      .from(publications)
      .where(eq(publications.id, publicationId));
    return row?.doiMetadata;
  }

  async listTags(publicationId: string) {
    return (
      await this.db.query.publicationTags.findMany({
        columns: { publicationIdInt: false },
        where: eq(publicationTags.publicationId, publicationId),
      })
    ).map((t) => t.tag);
  }

  async listPublishedReferences(publicationId: string) {
    return await this.db
      .selectDistinct({ text: references.text, url: references.url })
      .from(versionReferences)
      .innerJoin(references, eq(references.id, versionReferences.referenceId))
      .innerJoin(versions, eq(versions.id, versionReferences.versionId))
      .where(
        and(
          eq(versions.publicationId, publicationId),
          eq(versions.state, "PUBLISHED")
        )
      )
      .orderBy(references.url);
  }

  async listPublishedLinkedAssets(publicationId: string) {
    return await this.db
      .selectDistinct({
        name: linkedAssets.name,
        type: linkedAssets.type,
        url: linkedAssets.url,
      })
      .from(linkedAssets)
      .innerJoin(versions, eq(versions.id, linkedAssets.versionId))
      .where(
        and(
          eq(versions.publicationId, publicationId),
          eq(versions.state, "PUBLISHED")
        )
      )
      .orderBy(linkedAssets.type, linkedAssets.url);
  }
}
