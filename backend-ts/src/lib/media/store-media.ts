import { UnsupportedMediaError } from "#src/lib/errors/unsupported-media-error.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type FigureType } from "@raven/core-import-format";
import { _s3BucketName } from "./s3-bucket-name.js";
import { _s3PublicBaseUrl } from "./s3-public-url.js";
import { _uploadToS3 } from "./upload-to-s3.js";
import { _validateExtension } from "./validate-extension.js";

/**
 * Stores bytes the server already holds under `s3Key` and links them to the
 * version. Reuses a live asset with the same key,
 * unless reuseStoredAsset is false.
 *
 * @param sourceLabel - Where the bytes came from (a URL or filename), for
 *   error messages and S3 metadata
 * @param reuseStoredAsset - False when the caller already found the object
 *   missing from S3, so a live asset row for the key can't be trusted and
 *   the bytes are uploaded again
 * @returns The public S3 URL
 */
export async function storeMedia({
  buffer,
  extension,
  s3Key,
  hash,
  sourceLabel,
  figureType,
  versionId,
  repos,
  reuseStoredAsset = true,
}: {
  buffer: Buffer;
  extension: string;
  s3Key: string;
  hash: string;
  sourceLabel: string;
  figureType?: FigureType;
  versionId: string;
  repos: Repositories;
  reuseStoredAsset?: boolean;
}): Promise<string> {
  // ERROR MODE [HANDLED: FAIL-NOW]: UnsupportedMediaError.
  // [EDGE CASE]: this checks the claimed extension, not the real bytes.
  // _uploadToS3 sniffs the true type afterwards, rejects it if it's
  // unsupported, and may store a different supported content type.
  if (!_validateExtension(extension)) {
    throw new UnsupportedMediaError(extension || null, sourceLabel);
  }

  // ERROR MODE [HANDLED: RETRY -> DLQ]: DB errors. The link insert is an
  // upsert, so concurrent workers can't duplicate it.
  // [EDGE CASE]: two stores of the same bytes can both miss here and both
  // upload. Wasteful, but storage_key is unique and createMediaAsset upserts,
  // so they share one media_assets row.
  const existing = reuseStoredAsset
    ? await repos.versions.findMediaAssetByStorageKey(s3Key)
    : null;
  if (existing) {
    await repos.versions.createMediaAssetLink(versionId, existing.id);
    return `${_s3PublicBaseUrl(_s3BucketName())}/${s3Key}`;
  }

  return _uploadToS3({
    buffer,
    s3Key,
    sourceUrl: sourceLabel,
    extension,
    figureType,
    hash,
    versionId,
    repos,
  });
}
