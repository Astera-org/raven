import { logger } from "#src/lib/logger.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import {
  type FigureType,
  type ImportedUrlMedia,
} from "@raven/core-import-format";
import { createHash } from "node:crypto";
import { _downloadMedia } from "./download-media.js";
import { _fetchVersionId } from "./fetch-version-id.js";
import { _isObjectInS3 } from "./is-object-in-s3.js";
import { type ConcurrencyLimit } from "./limit-concurrency.js";
import { mediaS3Key } from "./media-s3-key.js";
import { _s3BucketName } from "./s3-bucket-name.js";
import { _s3PublicBaseUrl } from "./s3-public-url.js";
import { storeMedia } from "./store-media.js";

export async function transferUrlMedia({
  source,
  figureType,
  publicationId,
  versionId,
  repos,
  limitTransfer = (task) => task(),
}: {
  source: ImportedUrlMedia["source"];
  /** When given, the downloaded media's type must suit it. */
  figureType?: FigureType;
  publicationId: string;
  versionId: string;
  repos: Repositories;
  /**
   * Wraps the download and upload, which hold the whole file in memory, so a
   * caller can run the checks before them more widely.
   */
  limitTransfer?: ConcurrencyLimit;
}): Promise<string> {
  const { url } = source;
  const hash = createHash("sha256").update(url).digest("hex");

  // ERROR MODE [HANDLED: SWALLOWED]: the version-id HEAD is best-effort; on
  // failure the key just has no version suffix.
  // [EDGE CASE]: with no Last-Modified, an upstream file that changes at the
  // same URL reuses the stale S3 object.
  let upstreamVersion: string | null = null;
  try {
    upstreamVersion = await _fetchVersionId(url);
  } catch (e) {
    logger.warn(`Failed to fetch version id for ${url}: ${e}`);
  }

  const keySuffix = upstreamVersion
    ? `${hash.slice(0, 8)}_${upstreamVersion}`
    : hash.slice(0, 8);
  const s3Key = mediaS3Key({ publicationId, suffix: keySuffix });
  // ERROR MODE [HANDLED: FAIL-NOW + LOG]: throws ConfigError when
  // AWS_S3_BUCKET_NAME is unset or AWS_S3_PUBLIC_ENDPOINT isn't a valid URL.
  const s3Url = `${_s3PublicBaseUrl(_s3BucketName())}/${s3Key}`;

  // ERROR MODE [HANDLED: SWALLOWED]: S3 HEAD errors (credentials, network) are
  // treated as "not there", so the file is downloaded again.
  let exists = false;
  try {
    exists = await _isObjectInS3(s3Key);
  } catch (e) {
    logger.warn(`Failed to check if key ${s3Key} exists in S3: ${e}`);
  }

  // ERROR MODE [HANDLED: RECOVERS]: S3 object exists with no live asset row
  // (an earlier _uploadToS3 put the object then failed, or the asset was
  // soft-deleted). We fall through and upload again, which restores a
  // soft-deleted row.
  // [EDGE CASE]: two items in one batch with the same URL can both miss here
  // and both upload. Wasteful, but storage_key is unique, so they share one
  // media_assets row.
  if (exists) {
    const existingAsset =
      await repos.versions.findMediaAssetByStorageKey(s3Key);
    if (existingAsset) {
      // ERROR MODE [HANDLED: RETRY -> DLQ]: DB errors. The link insert is an
      // upsert, so concurrent workers can't duplicate it.
      await repos.versions.createMediaAssetLink(versionId, existingAsset.id);
      return s3Url;
    }
  }

  return limitTransfer(async () => {
    // ERROR MODE: see download-media.ts. Every failure arrives as a plain
    // Error, which hides whether it is permanent (should be FAIL-NOW) or
    // transient (RETRY).
    const { buffer, extension } = await _downloadMedia(url);

    // ERROR MODE: see store-media.ts.
    return storeMedia({
      buffer,
      extension,
      s3Key,
      hash,
      sourceLabel: url,
      figureType,
      versionId,
      repos,
      // Here the object is missing from S3 (or the check failed), or it has
      // no live row; either way a row for the key mustn't stand in for it.
      reuseStoredAsset: false,
    });
  });
}
