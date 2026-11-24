import {
  type MediaImportBatch,
  mediaImportBatches,
  type MediaImportBatchInsert,
  type MediaImportBatchUpdate,
  type MediaImportErrorCode,
  type MediaImportItem,
  type MediaImportItemInsert,
  mediaImportItems,
  type MediaImportItemUpdate,
  type VersionImport,
  type VersionImportInsert,
  versionImports,
} from "#src/db/schema.js";
import { and, count, eq, getTableColumns, inArray, sql } from "drizzle-orm";

import { BaseRepository } from "./base-repository.js";

const UNSETTLED_ITEM_STATUSES: MediaImportItem["status"][] = [
  "pending",
  "active",
];

const UNSETTLED_BATCH_STATUSES: MediaImportBatch["status"][] = [
  "processing",
  "finalizing",
];

export class ImportRepository extends BaseRepository {
  async create(versionImport: VersionImportInsert) {
    const [row] = (await this.db
      .insert(versionImports)
      .values(versionImport)
      .$returningId()) as [{ id: string }];
    return row.id;
  }

  /** Leaves out the raw source `body` unless `includeBody` is set. */
  async findById(
    importId: VersionImport["id"],
    options?: { includeBody?: false }
  ): Promise<Omit<VersionImport, "body"> | null>;
  async findById(
    importId: VersionImport["id"],
    options: { includeBody: true }
  ): Promise<VersionImport | null>;
  async findById(
    importId: VersionImport["id"],
    { includeBody = false }: { includeBody?: boolean } = {}
  ): Promise<VersionImport | Omit<VersionImport, "body"> | null> {
    const row = await this.db.query.versionImports.findFirst({
      columns: includeBody ? undefined : { body: false },
      where: eq(versionImports.id, importId),
    });
    return row ?? null;
  }

  /** Several imports, leaving out the raw source `body` and `diagnostics`. */
  async listSummariesByIds(
    importIds: VersionImport["id"][]
  ): Promise<Omit<VersionImport, "body" | "diagnostics">[]> {
    if (importIds.length === 0) return [];
    return this.db.query.versionImports.findMany({
      columns: { body: false, diagnostics: false },
      where: inArray(versionImports.id, importIds),
    });
  }

  async createMediaImportBatch(batch: MediaImportBatchInsert) {
    const [row] = (await this.db
      .insert(mediaImportBatches)
      .values(batch)
      .$returningId()) as [{ id: string }];
    return row.id;
  }

  async createMediaImportItem(item: MediaImportItemInsert[]) {
    const rows = await this.db
      .insert(mediaImportItems)
      .values(item)
      .$returningId();
    return rows;
  }

  async findMediaImportBatchById(
    batchId: MediaImportBatch["id"]
  ): Promise<MediaImportBatch | null> {
    const batch = await this.db.query.mediaImportBatches.findFirst({
      where: eq(mediaImportBatches.id, batchId),
    });
    return batch ?? null;
  }

  async findMediaImportBatchByImportId(
    importId: MediaImportBatch["importId"]
  ): Promise<MediaImportBatch | null> {
    const batch = await this.db.query.mediaImportBatches.findFirst({
      where: eq(mediaImportBatches.importId, importId),
    });
    return batch ?? null;
  }

  async findMediaImportItemById(
    itemId: MediaImportItem["id"]
  ): Promise<MediaImportItem | null> {
    const item = await this.db.query.mediaImportItems.findFirst({
      where: eq(mediaImportItems.id, itemId),
    });
    return item ?? null;
  }

  /** Leaves out each item's `data`, which only the transfer job needs. */
  async listMediaImportItems(
    batchId: MediaImportBatch["id"]
  ): Promise<Omit<MediaImportItem, "data">[]> {
    const { data: _data, ...columns } = getTableColumns(mediaImportItems);
    return this.db
      .select(columns)
      .from(mediaImportItems)
      .where(eq(mediaImportItems.batchId, batchId));
  }

  /**
   * True while a media import for the publication can still write to its
   * draft body, so other body edits must wait.
   */
  async hasUnsettledMediaImport(
    publicationId: MediaImportBatch["publicationId"]
  ): Promise<boolean> {
    const batch = await this.db.query.mediaImportBatches.findFirst({
      columns: { id: true },
      where: and(
        eq(mediaImportBatches.publicationId, publicationId),
        inArray(mediaImportBatches.status, UNSETTLED_BATCH_STATUSES)
      ),
    });
    return batch !== undefined;
  }

  async countUnsettledMediaImportItems(
    batchId: MediaImportBatch["id"]
  ): Promise<number> {
    const [row] = await this.db
      .select({ unsettled: count() })
      .from(mediaImportItems)
      .where(
        and(
          eq(mediaImportItems.batchId, batchId),
          inArray(mediaImportItems.status, UNSETTLED_ITEM_STATUSES)
        )
      );
    return row?.unsettled ?? 0;
  }

  async updateMediaImportBatch(
    batchId: MediaImportBatch["id"],
    update: MediaImportBatchUpdate
  ) {
    await this.db
      .update(mediaImportBatches)
      .set(update)
      .where(eq(mediaImportBatches.id, batchId));
  }

  async updateMediaImportItem(
    itemId: MediaImportItem["id"],
    update: MediaImportItemUpdate
  ) {
    await this.db
      .update(mediaImportItems)
      .set(update)
      .where(eq(mediaImportItems.id, itemId));
  }

  /** Returns false if another worker already moved the batch past processing. */
  async markMediaImportBatchFinalizing(
    batchId: MediaImportBatch["id"]
  ): Promise<boolean> {
    const [result] = await this.db
      .update(mediaImportBatches)
      .set({ status: "finalizing" })
      .where(
        and(
          eq(mediaImportBatches.id, batchId),
          eq(mediaImportBatches.status, "processing")
        )
      );
    return result.affectedRows === 1;
  }

  /** Fails the batch along with any of its items that haven't settled yet. */
  async markMediaImportBatchFailed(
    batchId: MediaImportBatch["id"],
    reason: string
  ) {
    await this.db
      .update(mediaImportItems)
      .set({ status: "failed", error: reason, errorCode: "failed", data: null })
      .where(
        and(
          eq(mediaImportItems.batchId, batchId),
          inArray(mediaImportItems.status, UNSETTLED_ITEM_STATUSES)
        )
      );
    await this.db
      .update(mediaImportBatches)
      .set({ status: "failed", error: reason })
      .where(eq(mediaImportBatches.id, batchId));
  }

  /** Returns false if the item had already settled (completed or failed). */
  async markMediaImportItemCompleted(
    itemId: MediaImportItem["id"],
    s3Url: string
  ): Promise<boolean> {
    const [result] = await this.db
      .update(mediaImportItems)
      .set({ status: "completed", s3Url, data: null, error: null })
      .where(
        and(
          eq(mediaImportItems.id, itemId),
          inArray(mediaImportItems.status, UNSETTLED_ITEM_STATUSES)
        )
      );
    return result.affectedRows === 1;
  }

  /** Returns false if the item had already settled (completed or failed). */
  async markMediaImportItemFailed(
    itemId: MediaImportItem["id"],
    code: MediaImportErrorCode,
    reason: string
  ): Promise<boolean> {
    const [result] = await this.db
      .update(mediaImportItems)
      .set({
        status: "failed",
        errorCode: code,
        // Keep the last attempt's error, prefixed with why we gave up.
        // CONCAT returns NULL if error is NULL, so COALESCE falls back to reason.
        error: sql`COALESCE(CONCAT(${reason}, ': ', ${mediaImportItems.error}), ${reason})`,
        data: null,
      })
      .where(
        and(
          eq(mediaImportItems.id, itemId),
          inArray(mediaImportItems.status, UNSETTLED_ITEM_STATUSES)
        )
      );
    return result.affectedRows === 1;
  }
}
