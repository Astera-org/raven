import { ConfigError, getConfig } from "#src/config.js";
import {
  MEDIA_ASSET_TYPES,
  type MediaAssetInsert,
  type MediaAssetType,
  type Version,
} from "#src/db/schema.js";
import { MalformedInputError } from "#src/lib/errors/malformed-input.js";
import { MediaTooLargeError } from "#src/lib/errors/media-too-large-error.js";
import { MediaTypeMismatchError } from "#src/lib/errors/media-type-mismatch-error.js";
import { UnsupportedMediaError } from "#src/lib/errors/unsupported-media-error.js";
import { logger } from "#src/lib/logger.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type FigureType } from "@raven/core-import-format";
import { fileTypeFromBuffer } from "file-type";
import isSvg from "is-svg";
import sharp from "sharp";
import { ulid } from "ulid";
import {
  type FfprobeResposne,
  ffprobeBuffer,
  getVideoRotation,
} from "./ffprobe-buffer.js";
import { EXTENSION_TO_MIME } from "./mime-types.js";
import { _s3BucketName } from "./s3-bucket-name.js";
import { getS3Client } from "./s3-client.js";
import { _s3PublicBaseUrl } from "./s3-public-url.js";
import { _validateExtension } from "./validate-extension.js";

type UploadToS3Props = {
  buffer: Buffer;
  s3Key: string;
  sourceUrl?: string;
  extension?: string;
  figureType?: FigureType;
  hash: string;
  versionId: Version["id"];
  repos: Repositories;
};

/**
 * Upload a file to S3.
 *
 * @param buffer - File contents
 * @param s3Key - S3 key where the file should be stored
 * @param sourceUrl - Original source URL, stored in S3 metadata
 * @param extension - File extension with leading dot
 * @param figureType - When given, the sniffed content type must suit it
 * @returns S3 URL of the uploaded file
 */
export async function _uploadToS3({
  buffer,
  s3Key,
  sourceUrl = "",
  extension = "",
  figureType,
  hash,
  versionId,
  repos,
}: UploadToS3Props): Promise<string> {
  // ERROR MODE [HANDLED: FAIL-NOW]: MediaTooLargeError. Downloads are
  // capped while reading; this also covers embedded and uploaded bytes.
  const maxBytes = getConfig().MEDIA_MAX_BYTES;
  if (buffer.byteLength > maxBytes) {
    throw new MediaTooLargeError(sourceUrl || s3Key, maxBytes);
  }

  const bucket = _s3BucketName();
  const s3Url = `${_s3PublicBaseUrl(bucket)}/${s3Key}`;

  let metadataUrl = sourceUrl;
  if (sourceUrl && sourceUrl.startsWith("data:")) {
    // Data URIs would be too large for S3 metadata
    metadataUrl = "base64-image";
  } else if (sourceUrl) {
    // Truncate long URLs to fit S3 metadata limits (2KB per metadata field)
    metadataUrl =
      sourceUrl.length > 1000 ? sourceUrl.slice(0, 1000) : sourceUrl;
  }

  try {
    const client = getS3Client();

    const fileType = await fileTypeFromBuffer(buffer);

    let normalizedExtension = fileType
      ? `.${fileType.ext}`
      : extension.toLowerCase();

    let contentType =
      fileType?.mime ??
      EXTENSION_TO_MIME[normalizedExtension] ??
      "application/octet-stream";
    if (normalizedExtension === ".html") contentType = "text/html";

    if (contentType === "application/xml" && isSvg(buffer.toString())) {
      contentType = "image/svg+xml";
      normalizedExtension = ".svg";
    }

    // Set Content-Disposition with proper filename for downloads
    const keyName = s3Key.split("/").pop()!;
    const filename = keyName.endsWith(normalizedExtension)
      ? keyName
      : `${keyName}${normalizedExtension}`;

    const metadata: Record<string, string> = {
      "source-url": encodeURI(Buffer.from(metadataUrl).toString("utf8")).slice(
        0,
        1000
      ),
      "uploaded-by": "the-stacks-backend",
    };
    // Add special flag for iframe content
    if (normalizedExtension === ".html") {
      metadata["content-usage"] = "iframe";
    }

    let contentTypePrefix = MEDIA_ASSET_TYPES.includes(
      contentType.split("/")[0]! as MediaAssetType
    )
      ? (contentType.split("/")[0]! as MediaAssetType)
      : "file";

    // ERROR MODE [HANDLED: FAIL-NOW]: UnsupportedMediaError for bytes that
    // sniff as a type no probe below checks, e.g. a ZIP named ".png".
    if (
      contentTypePrefix === "file" &&
      !_validateExtension(normalizedExtension)
    ) {
      throw new UnsupportedMediaError(normalizedExtension, metadataUrl);
    }

    // ERROR MODE [HANDLED: FAIL-NOW]: MediaTypeMismatchError, e.g. a Drive
    // HTML error page or a video placed in an image figure.
    const mismatch = () =>
      new MediaTypeMismatchError(
        `Expected ${metadataUrl} to be ${figureType} media, but its type is ${contentType}.`
      );
    // Audio-only MP4s sniff as video/mp4, so the probe below decides those.
    const maybeAudioMp4 = figureType === "audio" && contentType === "video/mp4";
    if (
      figureType &&
      !maybeAudioMp4 &&
      !contentTypeFitsFigure(contentType, figureType)
    ) {
      throw mismatch();
    }

    // Probe before the put so an unreadable file never reaches S3.
    // ERROR MODE [HANDLED: FAIL-NOW]: corrupt or unreadable media throws
    // MalformedInputError.
    const probeMeta = await probeMedia(buffer, contentTypePrefix, metadataUrl);

    if (maybeAudioMp4) {
      if (probeMeta.videoCodec) throw mismatch();
      contentType = "audio/mp4";
      contentTypePrefix = "audio";
    }

    const dbMeta: MediaAssetInsert = {
      id: ulid(),
      storageKey: s3Key,
      sha256: hash,
      byteSize: buffer.byteLength,
      mimeType: contentType,
      kind: contentTypePrefix,
      status: "ready",
      originUrl: sourceUrl,
      publicUrl: s3Url,
      ...probeMeta,
    };

    // ERROR MODE [HANDLED: RETRY -> DLQ]: S3 put failures (network,
    // throttling, credentials, missing bucket). The catch below logs them and
    // keeps them as the `cause` of the generic error.
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: contentType,
        ContentDisposition: `inline; filename="${filename}"`,
        Metadata: metadata,
      })
    );

    // ERROR MODE [HANDLED: RETRY, RECOVERS]: asset and link upserts with no
    // transaction. If the link insert fails, the retry finds the asset via
    // findMediaAssetByStorageKey in storeMedia.
    await repos.versions.createMediaAsset(versionId, {
      ...dbMeta,
    });

    return s3Url;
  } catch (e) {
    // These already carry user-facing messages, and the media worker fails
    // them without retrying.
    if (
      e instanceof MalformedInputError ||
      e instanceof MediaTypeMismatchError ||
      e instanceof UnsupportedMediaError ||
      e instanceof ConfigError
    ) {
      throw e;
    }
    logger.error(e, `Failed to upload file to S3`);
    throw new Error(
      `Could not save ${metadataUrl}.\nPlease contact the site administrator.`,
      { cause: e }
    );
  }
}

function contentTypeFitsFigure(contentType: string, figureType: FigureType) {
  if (figureType === "iframe") return contentType === "text/html";
  return contentType.startsWith(`${figureType}/`);
}

async function probeMedia(
  buffer: Buffer,
  kind: MediaAssetType,
  label: string
): Promise<Partial<MediaAssetInsert>> {
  if (kind === "image") {
    try {
      // Not `animated: true`: that stacks every frame, so `height` would be
      // the frame height times the number of pages.
      const imgMetadata = await sharp(buffer, { autoOrient: true }).metadata();
      // `width`/`height` are the stored dimensions even with `autoOrient`;
      // `autoOrient` holds the displayed ones after applying EXIF Orientation.
      return {
        width: imgMetadata.autoOrient.width,
        height: imgMetadata.autoOrient.height,
        probe: imgMetadata,
        probeTool: "sharp",
      };
    } catch (e) {
      throw new MalformedInputError(unreadableMediaMessage(label, kind), {
        cause: e,
      });
    }
  }

  if (kind !== "video" && kind !== "audio") {
    return {};
  }

  let probeData: FfprobeResposne;
  try {
    probeData = await ffprobeBuffer(buffer);
  } catch (e) {
    // ERROR MODE [HANDLED: RETRY -> DLQ]: ffprobe isn't installed. Not the
    // file's fault, so don't fail it as malformed.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw e;
    throw new MalformedInputError(unreadableMediaMessage(label, kind), {
      cause: e,
    });
  }

  const meta: Partial<MediaAssetInsert> = {
    probe: probeData,
    probeTool: "ffprobe",
    durationMs:
      Math.round(parseFloat(probeData.format.duration) * 1000) || null,
  };
  for (const stream of probeData.streams) {
    // Embedded cover art shows up as a video stream, but isn't video.
    if (stream.disposition?.attached_pic) continue;
    if (stream.codec_type === "audio") {
      meta.audioCodec = stream.codec_name;
      meta.audioCodecString = stream.mime_codec_string;
    }
    if (stream.codec_type === "video") {
      meta.videoCodec = stream.codec_name;
      meta.videoCodecString = stream.mime_codec_string;
      meta.pixelFormat = stream.pix_fmt;
      meta.colorTransfer = stream.color_transfer;
      meta.rotation = getVideoRotation(stream);
      const sideways = meta.rotation === 90 || meta.rotation === 270;
      meta.width = sideways ? stream.height : stream.width;
      meta.height = sideways ? stream.width : stream.height;
    }
  }
  return meta;
}

function unreadableMediaMessage(label: string, kind: MediaAssetType) {
  return `Could not read ${label} as ${kind}. The file may be corrupt or in an unsupported format.`;
}
