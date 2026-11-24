import { type Repositories } from "#v1/db-repositories/index.js";
import {
  MEDIA_CHECK_CONCURRENCY,
  MEDIA_TRANSFER_CONCURRENCY,
} from "./constants.js";
import { _extractMediaUrlsToUpload } from "./extract-media-urls-to-upload.js";
import { _limitConcurrency } from "./limit-concurrency.js";
import { _settleWithConcurrency } from "./settle-with-concurrency.js";
import { transferUrlMedia } from "./transfer-url-media.js";

/**
 * Upload media from directive attributes in `body` to S3 and replace the URLs
 * with S3 URLs.
 *
 * The S3 key for each file incorporates the Last-Modified header returned by
 * the source server, so when the upstream file changes (e.g. a new version is
 * uploaded to Google Drive) the key changes and the new version is uploaded.
 */
export async function uploadBodyMediaToS3({
  body,
  publicationId,
  versionId,
  repos,
}: {
  body: string | null | undefined;
  publicationId: string;
  versionId: string;
  repos: Repositories;
}): Promise<string | null | undefined> {
  if (!body) return body;

  const figures = _extractMediaUrlsToUpload(body);
  if (figures.length === 0) return body;

  // Most media in a saved body is already stored, so the cheap checks run
  // more widely than the downloads, which hold whole files in memory.
  const limitTransfer = _limitConcurrency(MEDIA_TRANSFER_CONCURRENCY);
  // Wait for every transfer to settle before reporting a failure, so no
  // download is left running in the background after the request has failed.
  const transfers = await _settleWithConcurrency(
    figures,
    ({ url }) =>
      transferUrlMedia({
        source: { type: "url", url },
        publicationId,
        versionId,
        repos,
        limitTransfer,
      }),
    MEDIA_CHECK_CONCURRENCY
  );

  let updatedBody = body;
  for (const [index, transfer] of transfers.entries()) {
    if (transfer.status === "rejected") throw transfer.reason;
    updatedBody = updatedBody.replaceAll(figures[index]!.url, transfer.value);
  }
  return updatedBody;
}
