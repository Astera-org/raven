import { ALLOWED_MEDIA_EXTENSIONS } from "#src/lib/media/allowed-media-extensions.js";

const SUPPORTED_TYPES = [...ALLOWED_MEDIA_EXTENSIONS].sort().join(", ");

export class UnsupportedMediaError extends Error {
  // A single unconditional super(): with parameter properties, tsc assigns
  // them before a super() nested in an if, which throws a ReferenceError.
  constructor(
    public ext: string | null,
    public url: string,
    options?: ErrorOptions
  ) {
    super(
      `${
        ext
          ? `Unsupported file type extension \`${ext}\` from url: ${url}`
          : `Unable to determine file type for url: ${url}`
      }. Supported types: ${SUPPORTED_TYPES}`,
      options
    );
  }
}
