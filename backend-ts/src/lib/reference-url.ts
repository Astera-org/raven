const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/i;
const DOI_PREFIX = /^doi:\s*/i;
const DOI_URL_PREFIX = /^https?:\/\/(?:dx\.)?doi\.org\/+/i;

/**
 * The canonical `https://doi.org/…` URL a DOI names, however it is written:
 * bare, as a `doi:` label, or as a doi.org URL of either scheme and with or
 * without the `dx.` host. Undefined for anything that isn't a DOI.
 *
 * One work gets one identifier whichever form names it, so a `{cite}` of a
 * DOI and a bibliography entry carrying the same DOI share one reference
 * number and one `references` row.
 */
export function canonicalDoiUrl(label: string): string | undefined {
  const doi = label.trim().replace(DOI_PREFIX, "").replace(DOI_URL_PREFIX, "");
  if (!DOI_PATTERN.test(doi)) return undefined;
  return `https://doi.org/${doi}`.toLowerCase();
}

export function isDoiUrl(url: string): boolean {
  try {
    const rootDomain = new URL(url).hostname.split(".").slice(-2).join(".");
    return rootDomain.toLowerCase() === "doi.org";
  } catch {
    // malformed URL captured by regex — treat as non-DOI
    return false;
  }
}

/**
 * The form reference URLs are stored in: DOI URLs are lowercased, since DOIs
 * are case-insensitive; every other URL is kept as written.
 */
export function normalizeReferenceUrl(url: string): string {
  return isDoiUrl(url) ? url.toLowerCase() : url;
}
