import { type Publication, type Version } from "#src/db/schema.js";
import { logger } from "#src/lib/logger.js";
import {
  type BossCommand,
  executeCommand,
} from "#src/lib/queue/execute-command.js";
import { extractAndStoreReferences } from "#src/lib/references.js";
import { Repositories } from "#v1/db-repositories/index.js";

/**
 * What's left once an import's MySQL transaction has committed: queue its
 * media uploads and extract the references from the version it wrote.
 * Returns whether the media batch is already settled.
 */
export async function finishImport({
  batchId,
  bossCommand,
  publicationId,
  versionId,
}: {
  /** From `createMediaImportEntries`. */
  batchId: string;
  bossCommand: BossCommand | null;
  publicationId: Publication["id"];
  versionId: Version["id"];
}): Promise<{ settled: boolean }> {
  const repos = new Repositories();
  /**
   * Because we use two databases, the transaction from the mysql database isn't
   * guaranteed to be committed when the boss jobs are ready. So until we are
   * on a single postgres database, this needs to be a separate function from
   * `createMediaImportEntries`, outside of the transaction.
   */
  let settled = bossCommand === null;
  if (bossCommand) {
    try {
      await executeCommand(bossCommand);
    } catch (err) {
      // ERROR MODE [HANDLED: LOG]: the draft is already committed, so fail the
      // batch rather than leave it "processing" with no jobs, which would block
      // body edits and publishing for good. The draft is still returned, with
      // the failed uploads reported by GET /imports/:id.
      // [EDGE CASE]: if this MySQL write fails too, the error propagates and
      // the batch stays "processing".
      logger.error(
        { err, publicationId, batchId },
        "Failed to queue media import jobs"
      );
      await repos.transaction((repos) =>
        repos.imports.markMediaImportBatchFailed(
          batchId,
          "Could not queue media upload"
        )
      );
      settled = true;
    }
  }

  const version = await repos.versions.findById(versionId);
  void extractAndStoreReferences(
    version!.idInt,
    `${version!.abstract ?? ""}\n${version!.body ?? ""}`
  ).catch((err: unknown) =>
    logger.error({ err }, "Failed to extract and store references")
  );

  return { settled };
}
