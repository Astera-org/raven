import { type PublicationResponse } from "#v1/routes/publications/route-responses/publication.js";

export function publicationUrls(
  publication: PublicationResponse | null,
  selectedVersionNum: number | null,
  baseUrl: string = "https://thestacks.org"
) {
  if (!publication) {
    return {
      basePublicationUrl: baseUrl,
      versionedPublicationUrl: baseUrl,
    };
  }
  const verPart =
    selectedVersionNum && !Number.isNaN(selectedVersionNum)
      ? `/v${selectedVersionNum}`
      : "";
  // the URLs should be absolute
  const basePublicationUrl = `${baseUrl}/publications/${publication.slug}`;
  const versionedPublicationUrl = `${basePublicationUrl}${verPart}`;
  return {
    basePublicationUrl,
    versionedPublicationUrl,
  };
}
