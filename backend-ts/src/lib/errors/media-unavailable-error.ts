/** The media source permanently can't be fetched (e.g. 404, private file). */
export class MediaUnavailableError extends Error {
  override name = "MediaUnavailableError";
}
