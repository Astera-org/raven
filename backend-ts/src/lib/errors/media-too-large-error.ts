const MIB = 1024 * 1024;

/** The media is larger than the MEDIA_MAX_BYTES setting allows. */
export class MediaTooLargeError extends Error {
  override name = "MediaTooLargeError";

  constructor(
    public label: string,
    public maxBytes: number,
    options?: ErrorOptions
  ) {
    super(
      `${label} is larger than the limit of ${formatLimit(maxBytes)}.`,
      options
    );
  }
}

function formatLimit(bytes: number): string {
  return bytes % MIB === 0 ? `${bytes / MIB} MiB` : `${bytes} bytes`;
}
