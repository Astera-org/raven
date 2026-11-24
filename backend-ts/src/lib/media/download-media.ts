import { getConfig } from "#src/config.js";
import { MediaTooLargeError } from "#src/lib/errors/media-too-large-error.js";
import { MediaUnavailableError } from "#src/lib/errors/media-unavailable-error.js";
import { UnsupportedMediaError } from "#src/lib/errors/unsupported-media-error.js";
import { _applyDevMediaOriginOverride } from "./apply-dev-media-origin-override.js";
import { _downloadBase64Image } from "./download-base64-image.js";
import { _extractGoogleDriveId } from "./extract-google-drive-id.js";
import {
  _getGoogleDriveFilename,
  DriveAccessError,
} from "./get-google-drive-filename.js";
import { MIME_TO_EXTENSION } from "./mime-types.js";

const log = console;

const MEDIA_RESPONSE_TIMEOUT_MS = 30_000;
const MEDIA_BODY_TIMEOUT_MS = 5 * 60_000;

/**
 * Download media from URL. Handles Google Drive URLs and base64 data URIs specially.
 *
 * @param maxBytes - Larger media throws MediaTooLargeError
 * @returns The downloaded bytes and their file extension
 */
export async function _downloadMedia(
  url: string,
  maxBytes: number = getConfig().MEDIA_MAX_BYTES
): Promise<{ buffer: Buffer; extension: string }> {
  // ERROR MODE [HANDLED: FAIL-NOW]: a malformed data URI throws
  // MalformedInputError.
  // [EDGE CASE]: invalid base64 doesn't throw here (Buffer.from is lenient).
  // For image/video/audio the probe in _uploadToS3 rejects the garbage bytes;
  // other types are uploaded as-is. An unknown MIME type falls back to ".png".
  // ERROR MODE [HANDLED: FAIL-NOW]: MediaTooLargeError. The data URI is
  // already in memory, so this only keeps it out of S3.
  if (url.startsWith("data:")) {
    const decoded = _downloadBase64Image(url);
    if (decoded.buffer.byteLength > maxBytes) {
      throw new MediaTooLargeError("The embedded media", maxBytes);
    }
    return decoded;
  }

  let downloadUrl = url;
  let extension: string | null = null;
  const driveId = _extractGoogleDriveId(url);

  if (driveId) {
    // ERROR MODE [HANDLED: FAIL-NOW]: DriveAccessError for private files.
    // [HANDLED: SWALLOWED]: network errors here (returns null; extension is
    // found later).
    const filename = await _getGoogleDriveFilename(driveId);
    downloadUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;
    if (filename) {
      const dotIndex = filename.lastIndexOf(".");
      extension = dotIndex >= 0 ? filename.slice(dotIndex) : null;
    }
  }

  // The fetch signal also governs reading the body, so a single short timeout
  // would abort large files (e.g. videos) mid-download. Use a short timeout
  // until the response arrives, then a longer one for reading the body.
  const controller = new AbortController();
  const abortAfter = (ms: number) =>
    setTimeout(
      () =>
        controller.abort(
          new DOMException(`Timed out after ${ms}ms`, "TimeoutError")
        ),
      ms
    );
  let timeout = abortAfter(MEDIA_RESPONSE_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      // ERROR MODE [HANDLED: RETRY -> DLQ]: DNS/connection failures and the
      // 30s response timeout.
      response = await fetch(_applyDevMediaOriginOverride(downloadUrl), {
        signal: controller.signal,
      });
    } catch (e) {
      log.error(`Failed to download media ${url}: ${e}`);
      throw new Error(
        `Failed to download ${url}. The server could not be reached.`,
        { cause: e }
      );
    }

    if (!response.ok) {
      log.error(`Failed to download media ${url}: HTTP ${response.status}`);
      // ERROR MODE [HANDLED: FAIL-NOW]: 4xx other than 408/429 (404, 403,
      // 410) won't change on retry.
      if (isPermanentHttpFailure(response.status)) {
        throw new MediaUnavailableError(
          `Failed to download ${url} (HTTP ${response.status}). Please verify the URL, and ensure the file is publicly accessible.`
        );
      }
      // ERROR MODE [HANDLED: RETRY -> DLQ]: 5xx, 408, 429.
      throw new Error(
        `Failed to download ${url} (HTTP ${response.status}). The server may be temporarily unavailable.`
      );
    }

    // For Google Drive, check if we got HTML instead of the file (indicates private file)
    if (driveId) {
      const contentType = (
        response.headers.get("Content-Type") ?? ""
      ).toLowerCase();
      // ERROR MODE [HANDLED: FAIL-NOW]: private Drive file.
      // [EDGE CASE]: Drive also returns an HTML virus-scan page for large
      // public files, which gets misreported as "not publicly accessible".
      if (contentType.includes("text/html")) {
        throw new DriveAccessError(
          `Google Drive file ${url} is not publicly accessible.`
        );
      }
    }

    if (!extension) {
      const contentType = response.headers.get("Content-Type") ?? "";
      extension =
        MIME_TO_EXTENSION[contentType.split(";")[0]!.trim().toLowerCase()] ??
        null;
    }

    if (!extension) {
      const urlPath = url.split("?")[0]!; // Remove query params
      const dotIndex = urlPath.lastIndexOf(".");
      const slashIndex = urlPath.lastIndexOf("/");
      if (dotIndex > slashIndex) extension = urlPath.slice(dotIndex);
    }

    // If we still don't have an extension, reject the file
    if (!extension) {
      // ERROR MODE [HANDLED: FAIL-NOW]: no extension can be determined.
      throw new UnsupportedMediaError(extension, url);
    }

    // ERROR MODE [HANDLED: FAIL-NOW]: MediaTooLargeError when the declared
    // size is over the limit, before any of the body is read.
    const declaredBytes = Number(response.headers.get("Content-Length"));
    if (declaredBytes > maxBytes) {
      controller.abort();
      throw new MediaTooLargeError(url, maxBytes);
    }

    clearTimeout(timeout);
    timeout = abortAfter(MEDIA_BODY_TIMEOUT_MS);

    let buffer: Buffer;
    try {
      // ERROR MODE [HANDLED: RETRY -> DLQ]: body timeout (5 min) or a dropped
      // connection.
      // [HANDLED: FAIL-NOW]: MediaTooLargeError once the body passes the
      // limit. Content-Length is often missing (Drive, chunked responses) or
      // is the compressed size, so the stream is counted as it's read.
      buffer = await readBodyWithLimit(response, maxBytes, url, controller);
    } catch (e) {
      if (e instanceof MediaTooLargeError) throw e;
      log.error(`Failed to read media ${url}: ${e}`);
      throw new Error(
        `Failed to download ${url}. The download timed out or was interrupted; very large files may need to be compressed or hosted elsewhere.`
      );
    }
    return { buffer, extension };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
  url: string,
  controller: AbortController
): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      controller.abort();
      throw new MediaTooLargeError(url, maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, totalBytes);
}

function isPermanentHttpFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
