import {
  type MediaImportItemInsert,
  type Publication,
  type Version,
  type VersionImport,
} from "#src/db/schema.js";
import { _downloadBase64Image } from "#src/lib/media/download-base64-image.js";
import { type BossCommand } from "#src/lib/queue/execute-command.js";
import { MEDIA_TRANSFER } from "#src/lib/tasks/queue-names.js";
import { type Repos } from "#v1/db-repositories/index.js";
import { type ImportedMedia } from "@raven/core-import-format";
import { ulid } from "ulid";

export async function createMediaImportEntries({
  media,
  publicationId,
  versionId,
  importId,
  repos,
}: {
  media: ImportedMedia[];
  publicationId: Publication["id"];
  versionId: Version["id"];
  importId: VersionImport["id"];
  repos: Repos;
}): Promise<{ batchId: string; bossCommand: BossCommand | null }> {
  const batchId = ulid();
  const items = media.map((m) => ({
    id: ulid(),
    batchId,
    ...toQueuedMedia(m),
  }));

  // With nothing to upload the batch is settled from the start, so body
  // edits and publishing aren't blocked waiting on a finalize job.
  await repos.imports.createMediaImportBatch({
    id: batchId,
    publicationId,
    versionId,
    importId,
    total: items.length,
    status: items.length === 0 ? "completed" : "processing",
  });
  if (items.length === 0) {
    return { batchId, bossCommand: null };
  }
  await repos.imports.createMediaImportItem(items);

  return {
    batchId,
    bossCommand: {
      method: "insert",
      key: MEDIA_TRANSFER,
      data: items.map((i) => ({
        data: { batchId, itemId: i.id },
        singletonKey: i.id,
      })),
    },
  };
}

/**
 * Splits a `bytes` source's data out of the media, since the `media` JSON
 * column can't hold it. A `url` source that's really a `data:` URL is decoded
 * into a `bytes` source first, so its (often large) base64 isn't stored.
 */
function toQueuedMedia(
  media: ImportedMedia
): Pick<MediaImportItemInsert, "ref" | "media" | "data"> {
  const { ref, figureType, source } = media;
  if (source.type === "url" && !source.url.startsWith("data:")) {
    return { ref, media: { ref, figureType, source }, data: null };
  }

  if (source.type === "bytes") {
    const { data, ...rest } = source;
    return {
      ref,
      media: { ref, figureType, source: rest },
      data: Buffer.from(data),
    };
  }

  // ERROR MODE [HANDLED: FAIL-NOW]: an undecodable data URL throws
  // MalformedInputError here, failing the import request rather than queuing
  // an item that can't succeed.
  const { buffer, extension, mimeType } = _downloadBase64Image(source.url);
  return {
    ref,
    media: {
      ref,
      figureType,
      source: {
        type: "bytes",
        filename: `${figureType}${extension}`,
        mimeType,
      },
    },
    data: buffer,
  };
}
