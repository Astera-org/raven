import { makeRepositories } from "#v1/db-repositories/index.js";
import { replaceMediaRefs } from "@raven/core-import-format";

class MediaImportItemAlreadySettledError extends Error {
  override name = "MediaImportItemAlreadySettledError";
}

export async function applyMediaUrlToVersionBody({
  versionId,
  itemId,
  ref,
  s3Url,
}: {
  versionId: string;
  itemId: string;
  ref: string;
  s3Url: string;
}): Promise<boolean> {
  try {
    return await makeRepositories().transaction(async (repos) => {
      // Lock the version row; other workers wait here until we commit
      // ERROR MODE [HANDLED: RETRY -> DLQ]: lock wait timeout or deadlock while
      // contending with other workers (localConcurrency 4) on the same version.
      // User body edits are rejected until the batch settles
      // (hasUnsettledMediaImport), so they don't contend.
      const version = await repos.versions.findBodyForUpdate(versionId);
      // ERROR MODE [HANDLED: RETRY -> SKIP]: version deleted mid-job. The batch
      // and items cascade away with it, so the retry hits the worker's early
      // return.
      if (!version) throw new Error(`Version ${versionId} not found`);

      const nextBody = replaceMediaRefs(version.body ?? "", (bodyRef) =>
        ref === bodyRef ? s3Url : bodyRef
      );
      // ERROR MODE [EDGE CASE]: if the ref isn't in the body this is a silent
      // no-op that still marks the item completed. Body edits are blocked while
      // the batch is unsettled, so issues are unlikely anyway.
      if (nextBody !== version.body) {
        await repos.versions.update(versionId, { body: nextBody });
      }

      // ERROR MODE [HANDLED: ROLLBACK]: item already settled (e.g. failed by
      // the dead-letter worker while an expired run was still going). Throw so
      // the body update rolls back, and report false to the caller.
      const completed = await repos.imports.markMediaImportItemCompleted(
        itemId,
        s3Url
      );
      if (!completed) throw new MediaImportItemAlreadySettledError();
      return true;
    });
  } catch (e) {
    if (e instanceof MediaImportItemAlreadySettledError) return false;
    throw e;
  }
}
