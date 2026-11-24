import { ConfigError } from "#src/config.js";
import { type MediaImportErrorCode } from "#src/db/schema.js";
import { MalformedInputError } from "#src/lib/errors/malformed-input.js";
import { MediaTooLargeError } from "#src/lib/errors/media-too-large-error.js";
import { MediaTypeMismatchError } from "#src/lib/errors/media-type-mismatch-error.js";
import { MediaUnavailableError } from "#src/lib/errors/media-unavailable-error.js";
import { UnsupportedMediaError } from "#src/lib/errors/unsupported-media-error.js";

/**
 * What clients are told about a failed item. The item's `error` column keeps
 * the details, which can include URLs and server internals.
 */
export const MEDIA_IMPORT_ERROR_MESSAGES: Record<MediaImportErrorCode, string> =
  {
    unavailable:
      "The media couldn't be downloaded. Check that it still exists and is shared publicly.",
    unsupported: "The media's file type isn't supported.",
    "too-large":
      "The media is too large to copy. Compress it or host it elsewhere.",
    unreadable:
      "The media couldn't be read. It may be damaged, or not the type of file it claims to be.",
    "retries-exhausted":
      "The media couldn't be downloaded after several attempts. Its host may be unavailable, or the file may be too large.",
    failed: "The media couldn't be copied.",
    "media-type-mismatch":
      "The media's file type doesn't match its figure, e.g. a video in an image figure.",
  };

/**
 * Errors that retrying can't fix, and the code to fail the item with. Errors
 * of any other class are retried.
 */
const PERMANENT_ERRORS: [
  new (...args: never[]) => Error,
  MediaImportErrorCode,
][] = [
  [MediaUnavailableError, "unavailable"],
  [UnsupportedMediaError, "unsupported"],
  [MediaTooLargeError, "too-large"],
  [MalformedInputError, "unreadable"],
  [ConfigError, "failed"],
  [MediaTypeMismatchError, "media-type-mismatch"],
];

export function permanentMediaImportFailure(
  e: unknown
): { code: MediaImportErrorCode; reason: string } | null {
  for (const [ErrorClass, code] of PERMANENT_ERRORS) {
    if (e instanceof ErrorClass) return { code, reason: e.message };
  }
  return null;
}
