import { type MediaImportItem } from "#src/db/schema.js";
import { MEDIA_IMPORT_ERROR_MESSAGES } from "#src/lib/media/media-import-errors.js";
import { type MediaUploadItemResponse } from "./route-responses/get-import-response-schema.js";

export function buildMediaUploadResponse(
  item: Omit<MediaImportItem, "data">
): MediaUploadItemResponse {
  const { source } = item.media;
  // Items that failed before error codes were recorded have none.
  const errorCode = item.errorCode ?? "failed";
  return {
    id: item.id,
    ref: item.ref,
    status: item.status,
    url: item.status === "completed" ? item.s3Url : null,
    source:
      source.type === "url"
        ? { type: "url", url: source.url }
        : {
            type: "bytes",
            filename: source.filename,
            mimeType: source.mimeType,
          },
    error:
      item.status === "failed"
        ? { code: errorCode, message: MEDIA_IMPORT_ERROR_MESSAGES[errorCode] }
        : null,
  };
}
