import {
  contributorAffiliations,
  contributors,
  linkedAssets,
  mediaAssets,
  references,
  versionImports,
  versionMediaAssetMap,
  versionReferences,
  versions,
  type MediaAsset,
  type MediaAssetInsert,
  type MediaAssetUpdate,
  type Version,
  type VersionInsert,
  type VersionUpdate,
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
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { BaseRepository } from "./base-repository.js";
import { tf, type TriggerFilled } from "./helpers/trigger-filled-map.js";

export type VersionListItemRow = {
  id: Version["id"];
  versionNumber: Version["versionNumber"];
  versionDesc: Version["versionDesc"];
  doi: Version["doi"];
  state: Version["state"];
  createdAt: Version["createdAt"];
  currentImportId: Version["currentImportId"];
};

/**
 * `idInt` is only for the integer-keyed DataCite client fetchers a DOI audit
 * calls; it never reaches a response. This is the api-versioning skill's
 * exception for shared int-keyed subsystems.
 */
export type PublishedVersionMetadataRow = {
  id: Version["id"];
  idInt: Version["idInt"];
  versionNumber: Version["versionNumber"];
  title: Version["title"];
  subtitle: Version["subtitle"];
  abstract: Version["abstract"];
  versionDesc: Version["versionDesc"];
  doi: Version["doi"];
  createdAt: Version["createdAt"];
};

export class VersionsRepository extends BaseRepository {
  async create(fields: TriggerFilled<typeof versions>): Promise<Version> {
    const returning = await this.db
      .insert(versions)
      .values(fields as VersionInsert)
      .$returningId();

    /**
     * @todo - After migrating ULID to primary key we can do the same with:
     *
     * ```ts
     * id: varchar("id", { length: 26 })
     *   .notNull()
     *   .$defaultFn(() => ulid())
     *   .unique(),
     * ```
     *
     * Drizzle can only get the ULID if you generate it in node, so `$defaultFn`
     * is a required piece to the puzzle.
     */
    return (await this.db.query.versions.findFirst({
      where: eq(versions.idInt, returning[0]!.idInt),
    }))!;
  }

  async findById(versionId: string): Promise<Version | undefined> {
    return this.db.query.versions.findFirst({
      where: eq(versions.id, versionId),
    });
  }

  /** Only the ids, since the import status endpoint is polled every second. */
  async findByImportId(
    importId: string
  ): Promise<Pick<Version, "id" | "publicationId"> | null> {
    const [row] = await this.db
      .select({ id: versions.id, publicationId: versions.publicationId })
      .from(versions)
      .innerJoin(versionImports, eq(versions.id, versionImports.versionId))
      .where(eq(versionImports.id, importId));
    return row ?? null;
  }

  /** Locks the row until the surrounding transaction ends; call inside one. */
  async findBodyForUpdate(
    versionId: Version["id"]
  ): Promise<{ body: Version["body"] } | null> {
    const [row] = await this.db
      .select({ body: versions.body })
      .from(versions)
      .where(eq(versions.id, versionId))
      .for("update");
    return row ?? null;
  }

  /** Locks the row until the surrounding transaction ends; call inside one. */
  async findForUpdate(versionId: Version["id"]): Promise<Version | null> {
    const [row] = await this.db
      .select()
      .from(versions)
      .where(eq(versions.id, versionId))
      .for("update");
    return row ?? null;
  }

  async findDraftForPublication(
    publicationId: string
  ): Promise<Version | undefined> {
    return this.db.query.versions.findFirst({
      where: and(
        eq(versions.publicationId, publicationId),
        eq(versions.state, "DRAFT")
      ),
      orderBy: desc(versions.createdAt),
    });
  }

  async findDraftIdByPubId(publicationId: string): Promise<string | null> {
    const draft = await this.findDraftForPublication(publicationId);
    return draft?.id ?? null;
  }

  async findByVersionNumberOfPublication(
    publicationId: string,
    versionNumber: number
  ) {
    return this.db.query.versions.findFirst({
      where: and(
        eq(versions.publicationId, publicationId),
        eq(versions.versionNumber, versionNumber)
      ),
    });
  }

  async hasPublished(publicationId: string): Promise<boolean> {
    const row = await this.db.query.versions.findFirst({
      columns: { id: true },
      where: and(
        eq(versions.publicationId, publicationId),
        eq(versions.state, "PUBLISHED")
      ),
    });
    return row != null;
  }

  async listDois(
    publicationId: string,
    { state }: { state?: Version["state"] } = {}
  ): Promise<string[]> {
    const rows = await this.db
      .select({ doi: versions.doi })
      .from(versions)
      .where(
        and(
          eq(versions.publicationId, publicationId),
          isNotNull(versions.doi),
          state ? eq(versions.state, state) : undefined
        )
      )
      .orderBy(asc(versions.versionNumber));
    return rows.map((r) => r.doi!);
  }

  /** A publication's published versions, oldest first. */
  async listPublished(
    publicationId: string
  ): Promise<PublishedVersionMetadataRow[]> {
    return await this.db
      .select({
        id: versions.id,
        idInt: versions.idInt,
        versionNumber: versions.versionNumber,
        title: versions.title,
        subtitle: versions.subtitle,
        abstract: versions.abstract,
        versionDesc: versions.versionDesc,
        doi: versions.doi,
        createdAt: versions.createdAt,
      })
      .from(versions)
      .where(
        and(
          eq(versions.publicationId, publicationId),
          eq(versions.state, "PUBLISHED")
        )
      )
      .orderBy(asc(versions.versionNumber));
  }

  /**
   * Version drafts can be deleted, so the `publication.latestVersionNumber` is not
   * guaranteed to be the largest version number, so to avoid conflicts, we want
   * to have the ability to get what should be the next version number.
   */
  async getNextVersionNumber(publicationId: string): Promise<number> {
    const row = await this.db.query.versions.findFirst({
      columns: { versionNumber: true },
      where: and(eq(versions.publicationId, publicationId)),
      orderBy: desc(versions.versionNumber),
    });

    return (row?.versionNumber ?? 0) + 1;
  }

  /**
   * Creates a new draft version from `source`, carrying over its content,
   * linked assets, references, contributors and their affiliations. Callers
   * should run this in a transaction so a partial copy is never left behind.
   */
  async createDraftFromVersion(source: Version): Promise<Version> {
    const draft = await this.create({
      id: null,
      publicationId: source.publicationId,
      publicationIdInt: null,
      title: source.title,
      subtitle: source.subtitle,
      abstract: source.abstract,
      body: source.body,
      bibliography: source.bibliography,
      frontmatter: source.frontmatter,
      versionNumber: await this.getNextVersionNumber(source.publicationId),
      // Intentionally set to null, previous imports reference previous versions
      // so rather than creating a copy or making a reference mismatch, it makes
      // more sense to look up imports from previous versions.
      currentImportId: null,

      /** @deprecated */
      importDocumentBody: source.importDocumentBody,
      importDocumentUrl: source.importDocumentUrl,
      importDocumentFilename: source.importDocumentFilename,
      importDocumentFormat: source.importDocumentFormat,
      importDocumentSyncDate: source.importDocumentSyncDate,
    });

    const [assets, referenceRows, affiliations, sourceContributors] =
      await Promise.all([
        this.listLinkedAssets(source.id),
        this.db
          .select({ referenceId: versionReferences.referenceId })
          .from(versionReferences)
          .where(eq(versionReferences.versionId, source.id)),
        this.db
          .select({
            userId: contributorAffiliations.userId,
            affiliatedOrgId: contributorAffiliations.affiliatedOrgId,
          })
          .from(contributorAffiliations)
          .where(eq(contributorAffiliations.versionId, source.id)),
        this.db
          .select({
            userId: contributors.userId,
            roles: contributors.roles,
            inByline: contributors.inByline,
            priority: contributors.priority,
          })
          .from(contributors)
          .where(eq(contributors.versionId, source.id)),
      ]);

    await this.createLinkedAssets(draft.id, assets);

    if (referenceRows.length) {
      await this.db.insert(versionReferences).values(
        tf<typeof versionReferences>(
          referenceRows.map(({ referenceId }) => ({
            id: null,
            versionId: draft.id,
            versionIdInt: null,
            referenceId,
            referenceIdInt: null,
          }))
        )
      );
    }

    if (affiliations.length) {
      await this.db.insert(contributorAffiliations).values(
        tf<typeof contributorAffiliations>(
          affiliations.map(({ userId, affiliatedOrgId }) => ({
            id: null,
            versionId: draft.id,
            versionIdInt: null,
            userId,
            userIdInt: null,
            affiliatedOrgId,
            affiliatedOrgIdInt: null,
          }))
        )
      );
    }

    // Contributors are version-scoped, so the draft starts as a copy of the
    // byline it supersedes; editing it leaves the source version alone.
    if (sourceContributors.length) {
      await this.db.insert(contributors).values(
        tf<typeof contributors>(
          sourceContributors.map((contributor) => ({
            ...contributor,
            versionId: draft.id,
            versionIdInt: null,
            userIdInt: null,
          }))
        )
      );
    }

    // Link existing media assets to new version
    await this.db.insert(versionMediaAssetMap).select(
      this.db
        .select({
          versionId: sql`${draft.id}`.as("ver_id"),
          mediaAssetId: versionMediaAssetMap.mediaAssetId,
        })
        .from(versionMediaAssetMap)
        .where(eq(versionMediaAssetMap.versionId, source.id))
    );

    return draft;
  }

  async list(
    publicationId: string,
    includeDraft?: boolean
  ): Promise<VersionListItemRow[]> {
    const rows = await this.db.query.versions.findMany({
      columns: {
        id: true,
        versionNumber: true,
        versionDesc: true,
        doi: true,
        state: true,
        createdAt: true,
        currentImportId: true,
      },
      where: and(
        eq(versions.publicationId, publicationId),
        inArray(
          versions.state,
          includeDraft ? ["PUBLISHED", "DRAFT"] : ["PUBLISHED"]
        )
      ),
      orderBy: desc(versions.versionNumber),
    });
    return rows;
  }

  async listLinkedAssets(
    versionId: string
  ): Promise<Array<{ type: string; url: string; name: string | null }>> {
    return this.db.query.linkedAssets.findMany({
      columns: { name: true, url: true, type: true },
      where: eq(linkedAssets.versionId, versionId),
    });
  }

  async deleteLinkedAssets(
    versionId: string,
    assets: Array<{ url: string; type: string }>
  ) {
    if (assets.length === 0) return;
    await this.db
      .delete(linkedAssets)
      .where(
        and(
          eq(linkedAssets.versionId, versionId),
          or(
            ...assets.map(({ url, type }) =>
              and(eq(linkedAssets.url, url), eq(linkedAssets.type, type))
            )
          )
        )
      );
  }

  async updateLinkedAssetName(
    versionId: string,
    url: string,
    type: string,
    name: string
  ) {
    await this.db
      .update(linkedAssets)
      .set({ name })
      .where(
        and(
          eq(linkedAssets.versionId, versionId),
          eq(linkedAssets.url, url),
          eq(linkedAssets.type, type)
        )
      );
  }

  async createLinkedAssets(
    versionId: string,
    assets: Array<{ url: string; type: string; name: string | null }>
  ) {
    if (assets.length === 0) return;
    await this.db.insert(linkedAssets).values(
      tf<typeof linkedAssets>(
        assets.map((a) => ({
          versionId,
          versionIdInt: null,
          url: a.url,
          type: a.type,
          name: a.name,
        }))
      )
    );
  }

  async listReferences(
    versionId: string
  ): Promise<Array<{ url: string | null; text: string | null }>> {
    return this.db
      .select({ url: references.url, text: references.text })
      .from(versionReferences)
      .innerJoin(references, eq(references.id, versionReferences.referenceId))
      .where(eq(versionReferences.versionId, versionId))
      .orderBy(asc(versionReferences.idInt));
  }

  async update(versionId: string, update: VersionUpdate) {
    await this.db
      .update(versions)
      .set(update)
      .where(eq(versions.id, versionId));
  }

  /**
   * Inserts the asset, or updates the existing row with the same storage key
   * (restoring it if soft-deleted), then links it to the version.
   */
  async createMediaAsset(
    versionId: Version["id"],
    fields: MediaAssetInsert
  ): Promise<void> {
    const { id: _id, createdAt: _createdAt, ...update } = fields;
    await this.db
      .insert(mediaAssets)
      .values(fields)
      .onDuplicateKeyUpdate({ set: { ...update, deletedAt: null } });
    // On a duplicate key the row keeps its original id, so look it up.
    const asset = await this.db.query.mediaAssets.findFirst({
      columns: { id: true },
      where: eq(mediaAssets.storageKey, fields.storageKey),
    });
    await this.createMediaAssetLink(versionId, asset!.id);
  }

  async createMediaAssetLink(
    versionId: Version["id"],
    mediaAssetId: MediaAsset["id"]
  ): Promise<void> {
    await this.db
      .insert(versionMediaAssetMap)
      .values({ versionId, mediaAssetId })
      .onDuplicateKeyUpdate({ set: { versionId } });
  }

  async findMediaAssetByStorageKey(
    storageKey: MediaAsset["storageKey"]
  ): Promise<MediaAsset | null> {
    const asset = await this.db.query.mediaAssets.findFirst({
      where: and(
        eq(mediaAssets.storageKey, storageKey),
        isNull(mediaAssets.deletedAt)
      ),
    });
    return asset ?? null;
  }

  async findMediaAssetById(
    mediaAssetId: MediaAsset["id"],
    { includeDeleted = false }: { includeDeleted: boolean }
  ): Promise<MediaAsset | undefined> {
    return this.db.query.mediaAssets.findFirst({
      /** @todo don't return integer id columns */
      // columns: { idInt: false, ownerIdInt: false },
      where: includeDeleted
        ? eq(mediaAssets.id, mediaAssetId)
        : and(eq(mediaAssets.id, mediaAssetId), isNull(mediaAssets.deletedAt)),
    });
  }

  async listMediaAssets(
    versionId: Version["id"],
    filters: {
      pagination?: PaginationQueryRequest;
    } = {}
  ): Promise<
    PaginatedResponseV1<
      Omit<
        MediaAsset,
        | "parentId"
        | "createdAt"
        | "deletedAt"
        | "variant"
        | "recipe"
        | "storageKey"
        | "sha256"
        | "originUrl"
        | "status"
        | "probe"
        | "probeTool"
        | "videoCodec"
        | "videoCodecString"
        | "pixelFormat"
        | "colorTransfer"
        | "audioCodec"
        | "audioCodecString"
      >
    >
  > {
    const { page, perPage, offset } = getPagination(filters.pagination ?? {});
    let query = this.db
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
      .where(eq(versionMediaAssetMap.versionId, versionId));

    if (
      filters.pagination?.page !== undefined ||
      filters.pagination?.perPage !== undefined
    ) {
      // @ts-expect-error(2739) - they're not quite typed the same but it doesn't matter
      query = query.offset(offset).limit(perPage);
    }

    const items = await query;

    const countRow = await this.db
      .select({ total: count() })
      .from(mediaAssets)
      .innerJoin(
        versionMediaAssetMap,
        eq(mediaAssets.id, versionMediaAssetMap.mediaAssetId)
      )
      .where(eq(versionMediaAssetMap.versionId, versionId));

    return {
      items,
      pagination: { total: countRow[0]?.total ?? 0, page, perPage },
    };
  }

  async deleteMediaAsset(
    versionId: Version["id"],
    mediaAssetId: MediaAsset["id"]
  ) {
    await this.db
      .delete(versionMediaAssetMap)
      .where(
        and(
          eq(versionMediaAssetMap.versionId, versionId),
          eq(versionMediaAssetMap.mediaAssetId, mediaAssetId)
        )
      );
    const [remainingUses] = await this.db
      .select({ total: count() })
      .from(versionMediaAssetMap)
      .where(eq(versionMediaAssetMap.mediaAssetId, mediaAssetId));
    if (remainingUses?.total === 0) {
      await this.db
        .update(mediaAssets)
        .set({ deletedAt: new Date() })
        .where(eq(mediaAssets.id, mediaAssetId));
    }
  }

  async updateMediaAsset(mediaAssetId: string, update: MediaAssetUpdate) {
    await this.db
      .update(mediaAssets)
      .set(update)
      .where(eq(mediaAssets.id, mediaAssetId));
  }
}
