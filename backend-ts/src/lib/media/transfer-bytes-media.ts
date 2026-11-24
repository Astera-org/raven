import { type QueuedImportedMedia } from "#src/db/schema.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { type FigureType } from "@raven/core-import-format";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { mediaS3Key } from "./media-s3-key.js";
import { storeMedia } from "./store-media.js";

type BytesSource = Extract<QueuedImportedMedia["source"], { type: "bytes" }>;

/**
 * Uploads imported bytes to S3, keyed by their hash, and links them to the
 * version. The counterpart of `transferUrlMedia` for `bytes` sources.
 */
export async function transferBytesMedia({
  source,
  data,
  figureType,
  publicationId,
  versionId,
  repos,
}: {
  source: BytesSource;
  data: Uint8Array;
  figureType: FigureType;
  publicationId: string;
  versionId: string;
  repos: Repositories;
}): Promise<string> {
  const hash = createHash("sha256").update(data).digest("hex");

  // ERROR MODE: see store-media.ts. The extension comes from the importer's
  // filename; _uploadToS3 still sniffs the real type.
  return storeMedia({
    buffer: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
    extension: extname(source.filename),
    s3Key: mediaS3Key({ publicationId, suffix: hash.slice(0, 8) }),
    hash,
    sourceLabel: source.filename,
    figureType,
    versionId,
    repos,
  });
}
