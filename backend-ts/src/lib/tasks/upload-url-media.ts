import { ConfigError } from "#src/config.js";
import { logger } from "#src/lib/logger.js";
import { applyMediaUrlToVersionBody } from "#src/lib/media/apply-media-url-to-version-body.js";
import { maybeFinalizeMediaImport } from "#src/lib/media/maybe-finalize-media-import.js";
import { permanentMediaImportFailure } from "#src/lib/media/media-import-errors.js";
import { transferBytesMedia } from "#src/lib/media/transfer-bytes-media.js";
import { transferUrlMedia } from "#src/lib/media/transfer-url-media.js";
import { DEAD_LETTER_OPTIONS } from "#src/lib/queue/constants.js";
import {
  MEDIA_IMPORT_FINALIZE,
  MEDIA_IMPORT_FINALIZE_DEAD,
  MEDIA_TRANSFER,
  MEDIA_TRANSFER_DEAD,
} from "#src/lib/tasks/queue-names.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { type JobWithMetadata, type PgBoss } from "pg-boss";
import { z } from "zod";

const TransferJobSchema = z.object({ batchId: z.string(), itemId: z.string() });
type TransferJob = z.infer<typeof TransferJobSchema>;

// ERROR MODE tags (grep "ERROR MODE"), used here and in lib/media/*:
//   [HANDLED: X]          current handling is correct; X is what happens
//   [MISHANDLED: X -> Y]  currently does X, should do Y
//   [UNHANDLED -> Y]      nothing deals with it; should do Y
//   [EDGE CASE]           not a thrown error, but behaviour worth knowing
//   [NEEDS LOG]           handling is fine but the error isn't logged usefully
// Handling keywords:
//   RETRY      throw so pg-boss retries with backoff (transient errors)
//   DLQ        retries exhausted; media-transfer-dead marks the item failed
//   FAIL-NOW   markMediaImportItemFailed + maybeFinalize, no retry (permanent)
//   SKIP       end the job successfully without doing any work
//   RECOVERS   the next retry fixes it on its own
//   SWALLOWED  caught and ignored on purpose; work continues
//   ROLLBACK   undo the DB transaction
//   LOG        log the error with job context
export async function addUploadMedia(boss: PgBoss) {
  await boss.createQueue(MEDIA_TRANSFER_DEAD, DEAD_LETTER_OPTIONS);
  await boss.createQueue(MEDIA_TRANSFER, {
    retryLimit: 4,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 60 * 20,
    deadLetter: MEDIA_TRANSFER_DEAD,
  });
  await boss.createQueue(MEDIA_IMPORT_FINALIZE_DEAD, DEAD_LETTER_OPTIONS);
  await boss.createQueue(MEDIA_IMPORT_FINALIZE, {
    deadLetter: MEDIA_IMPORT_FINALIZE_DEAD,
  });

  // localConcurrency takes over from MEDIA_TRANSFER_CONCURRENCY
  await boss.work<TransferJob>(
    MEDIA_TRANSFER,
    { localConcurrency: 4 },
    async ([job]) => {
      if (!job) {
        return;
      }

      const repos = makeRepositories();

      // ERROR MODE [HANDLED: SKIP + LOG]: malformed payload. There's no
      // itemId to mark failed and retrying can't fix it, so end the job.
      if (!TransferJobSchema.safeParse(job.data).success) {
        logger.error(`Unexpected data for ${MEDIA_TRANSFER} job.`);
        return;
      }

      const { batchId, itemId } = job.data;

      try {
        // ERROR MODE [HANDLED: RETRY -> DLQ]: DB unavailable or connection pool
        // exhausted.
        const item = await repos.imports.findMediaImportItemById(itemId);
        const batch = await repos.imports.findMediaImportBatchById(batchId);
        // ERROR MODE [HANDLED: SKIP]: item/batch deleted (cascade from the
        // publication/version), or item already settled by an earlier or
        // overlapping run.
        // [HANDLED: RECOVERS]: calling maybeFinalizeMediaImport here lets a
        // retry finish a batch whose finalize step threw after the item
        // settled.
        if (
          !item ||
          !batch ||
          item.status === "completed" ||
          item.status === "failed"
        ) {
          await maybeFinalizeMediaImport(batchId);
          return;
        }

        // ERROR MODE [HANDLED: SKIP]: batch already settled, so there's nothing
        // to update.
        if (batch.status === "completed" || batch.status === "failed") {
          return;
        }

        // ERROR MODE [EDGE CASE]: a job that expires (20 min) while still
        // running is retried by pg-boss, so two runs can work on the same item.
        // They settle correctly (row lock + markMediaImportItemCompleted guard)
        // and share one media_assets row (unique storage_key); the only cost
        // is a duplicate download and upload.
        await repos.imports.updateMediaImportItem(itemId, { status: "active" });

        const source = item.media.source;
        // ERROR MODE [HANDLED: FAIL-NOW]: a bytes item queued without its data
        // can't succeed on retry.
        if (source.type === "bytes" && !item.data) {
          await repos.imports.markMediaImportItemFailed(
            itemId,
            "failed",
            "The media's data is missing"
          );
          await maybeFinalizeMediaImport(batchId);
          return;
        }
        try {
          // ERROR MODE: see transfer-url-media.ts and its helpers for each
          // case. Transient failures (timeouts, 5xx, S3/DB blips) are [HANDLED:
          // RETRY -> DLQ]. Permanent ones are [HANDLED: FAIL-NOW] via the
          // classes in permanentMediaImportFailure: UnsupportedMediaError,
          // ConfigError, MalformedInputError (incl. corrupt media),
          // MediaTypeMismatchError (content type doesn't suit the figure) and
          // MediaUnavailableError (4xx, private Drive file).
          const target = {
            figureType: item.media.figureType,
            publicationId: batch.publicationId,
            versionId: batch.versionId,
            repos,
          };
          const s3Url =
            source.type === "bytes"
              ? await transferBytesMedia({
                  source,
                  data: item.data!,
                  ...target,
                })
              : await transferUrlMedia({ source, ...target });
          // ERROR MODE: see apply-media-url-to-version-body.ts (lock timeouts,
          // version deleted, ref missing from body, body written after the item
          // settled).
          if (
            await applyMediaUrlToVersionBody({
              versionId: batch.versionId,
              itemId,
              ref: item.ref,
              s3Url,
            })
          ) {
            // ERROR MODE [HANDLED: RETRY, RECOVERS]: if this throws, the retry
            // exits through the early return above, which calls
            // maybeFinalizeMediaImport again. Exception: see the send() note in
            // maybe-finalize-media-import.ts.
            await maybeFinalizeMediaImport(batchId);
          }
        } catch (e) {
          // Retrying won't change the file type or the server config, so fail
          // immediately ERROR MODE [HANDLED: FAIL-NOW]. If either call below
          // throws, it falls to RETRY: a failed markMediaImportItemFailed
          // re-downloads and fails the same way (wasteful but correct); a
          // failed maybeFinalizeMediaImport RECOVERS via the early return.
          const failure = permanentMediaImportFailure(e);
          if (failure) {
            await repos.imports.markMediaImportItemFailed(
              itemId,
              failure.code,
              failure.reason
            );
            await maybeFinalizeMediaImport(batchId);
            // ERROR MODE [HANDLED: FAIL-NOW + LOG]: an operator problem, so log
            // the details and give the user a generic message.
            if (e instanceof ConfigError) {
              logger.error(
                { err: e, configKey: e.configKey, itemId, batchId },
                `${MEDIA_TRANSFER}: invalid server configuration`
              );
            }
            return;
          }
          // ERROR MODE [HANDLED: RETRY -> DLQ + LOG]: if recording the error
          // fails, log that and still rethrow `e`, so the original cause is
          // what pg-boss retries on and the catch below logs.
          try {
            await repos.imports.updateMediaImportItem(itemId, {
              error: String(e),
            });
          } catch (writeErr) {
            logger.error(
              { err: writeErr, itemId, batchId, jobId: job.id },
              `${MEDIA_TRANSFER}: could not record the item's error`
            );
          }
          throw e; // pg-boss retries, then dead-letters
        }

        // ERROR MODE [EDGE CASE]: runs again after the success branch already
        // called it. Harmless (markMediaImportBatchFinalizing guards it), but
        // it makes the `if` around applyMediaUrlToVersionBody pointless.
        await maybeFinalizeMediaImport(batchId);
      } catch (e) {
        // ERROR MODE [HANDLED: RETRY -> DLQ + LOG]: rethrows so pg-boss
        // retries, then dead-letters.
        logger.error(
          { err: e, itemId, batchId, jobId: job.id },
          `${MEDIA_TRANSFER}: attempt failed, retrying`
        );
        throw e;
      }
    }
  );

  await boss.work<TransferJob, void, { includeMetadata: true }>(
    MEDIA_TRANSFER_DEAD,
    { includeMetadata: true },
    async ([job]) => {
      if (!job) {
        return;
      }
      // ERROR MODE [HANDLED: RETRY + LOG]: retries per DEAD_LETTER_OPTIONS.
      // Nothing runs after the last one, so the item stays "active" and the
      // batch never finalizes; logDeadLetterFailure flags that attempt.
      // [EDGE CASE]: expired jobs (20 min) also land here, labelled "Exceeded
      // retry limit".
      try {
        await makeRepositories().imports.markMediaImportItemFailed(
          job.data.itemId,
          "retries-exhausted",
          "Exceeded retry limit"
        );
        await maybeFinalizeMediaImport(job.data.batchId);
      } catch (e) {
        logDeadLetterFailure(MEDIA_TRANSFER_DEAD, job, e);
        throw e;
      }
    }
  );

  await boss.work<{ batchId: string }>(MEDIA_IMPORT_FINALIZE, async ([job]) => {
    if (!job) {
      return;
    }
    const repos = makeRepositories();
    const { batchId } = job.data;
    // ERROR MODE [HANDLED: RETRY -> DLQ]: DB errors. Once retries run out,
    // MEDIA_IMPORT_FINALIZE_DEAD marks the batch failed.
    const items = await repos.imports.listMediaImportItems(batchId);

    const failed = items.filter((i) => i.status === "failed");
    if (failed.length) {
      await repos.imports.updateMediaImportBatch(batchId, {
        status: "failed",
      });
      return;
    }

    await repos.imports.updateMediaImportBatch(batchId, {
      status: "completed",
    });
  });

  await boss.work<{ batchId: string }, void, { includeMetadata: true }>(
    MEDIA_IMPORT_FINALIZE_DEAD,
    { includeMetadata: true },
    async ([job]) => {
      if (!job) {
        return;
      }
      try {
        // ERROR MODE [HANDLED: RETRY + LOG]: same as MEDIA_TRANSFER_DEAD. If
        // this write fails on the last retry, the batch stays "finalizing".
        // [EDGE CASE]: expired jobs (default 15 min) also land here.
        await makeRepositories().imports.updateMediaImportBatch(
          job.data.batchId,
          {
            status: "failed",
            error: "Exceeded retry limit",
          }
        );
      } catch (e) {
        logDeadLetterFailure(MEDIA_IMPORT_FINALIZE_DEAD, job, e);
        throw e;
      }
    }
  );
}

function logDeadLetterFailure(
  queue: string,
  job: JobWithMetadata<object>,
  err: unknown
) {
  const context = {
    err,
    jobId: job.id,
    retryCount: job.retryCount,
    ...job.data,
  };
  if (job.retryCount >= job.retryLimit) {
    logger.fatal(context, `${queue}: retries exhausted, giving up`);
    return;
  }
  logger.error(context, `${queue}: attempt failed, retrying`);
}
