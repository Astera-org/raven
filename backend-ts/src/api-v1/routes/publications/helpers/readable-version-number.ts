import { type Publication } from "#src/db/schema.js";

/**
 * A deleted publication stays readable only if it was DOI-registered, so the
 * DOI keeps resolving; it then always serves its last published version,
 * whichever version was requested. Returns `null` when it should 404.
 */
export function readableVersionNumber(
  publication: Pick<Publication, "state" | "doi" | "latestVersionNumber">,
  requestedVersionNumber: number
): number | null {
  if (publication.state !== "DELETED") return requestedVersionNumber;
  if (publication.doi == null) return null;
  return publication.latestVersionNumber;
}
