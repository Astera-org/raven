import { getBoss } from "#src/lib/queue/pg-boss.js";
import { MEDIA_IMPORT_FINALIZE } from "#src/lib/tasks/queue-names.js";
import { makeRepositories } from "#v1/db-repositories/index.js";

export async function maybeFinalizeMediaImport(batchId: string) {
  return makeRepositories().transaction(async (repos) => {
    // ERROR MODE [HANDLED: RETRY, RECOVERS]: the caller's retry exits through the
    // worker's early return for settled items, which calls this again.
    if ((await repos.imports.countUnsettledMediaImportItems(batchId)) > 0) {
      return;
    }

    const batch = await repos.imports.findMediaImportBatchById(batchId);
    const alreadyFinalizing = batch?.status === "finalizing";
    if (
      !alreadyFinalizing &&
      !(await repos.imports.markMediaImportBatchFinalizing(batchId))
    ) {
      return;
    }

    // ERROR MODE [HANDLED: RETRY, RECOVERS]: if send fails, the throw rolls
    // back the "finalizing" mark, and a batch already "finalizing" re-sends
    // anyway (singletonKey dedupes). pg-boss is on a separate Postgres, so
    // send isn't part of this transaction; if the commit fails after send,
    // the finalize worker sets the final status regardless.
    await getBoss().send(
      MEDIA_IMPORT_FINALIZE,
      { batchId },
      { singletonKey: batchId }
    );
  });
}
