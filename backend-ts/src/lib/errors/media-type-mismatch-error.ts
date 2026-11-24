/** The media's content type doesn't fit its figure (e.g. HTML for an image). */
export class MediaTypeMismatchError extends Error {
  override name = "MediaTypeMismatchError";
}
