import { MalformedInputError } from "#src/lib/errors/malformed-input.js";
import { MIME_TO_EXTENSION } from "./mime-types.js";

const DATA_URI_PATTERN = /^data:([^;,]+)?;base64,(.*)$/s;

/**
 * Decode a base64 data URI.
 *
 * @param dataUri - Data URI in format `data:[<mediatype>][;base64],<data>`
 * @returns The decoded bytes, their media type and inferred file extension
 */
export function _downloadBase64Image(dataUri: string): {
  buffer: Buffer;
  extension: string;
  mimeType: string;
} {
  const match = dataUri.match(DATA_URI_PATTERN);
  if (!match) {
    throw new MalformedInputError(
      "Invalid base64 data URI format. Expected 'data:<mediatype>;base64,<data>'."
    );
  }

  const mimeType = (match[1] || "application/octet-stream").toLowerCase();
  const base64Data = match[2] ?? "";
  const extension = MIME_TO_EXTENSION[mimeType] ?? ".png";

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch (e) {
    throw new MalformedInputError(
      `Failed to download image: ${(e as Error).message}. Please ensure the data URI is valid.`
    );
  }

  return { buffer, extension, mimeType };
}
