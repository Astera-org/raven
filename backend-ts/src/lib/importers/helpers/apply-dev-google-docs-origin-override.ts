import { getConfig } from "#src/config.js";

/**
 * Redirects docs.google.com requests to DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE when
 * it's set, so imports can run against the integration tests' mock. The mock
 * can't take over docs.google.com itself because the importer fetches it over
 * https.
 */
export function _applyDevGoogleDocsOriginOverride(url: string): string {
  const { DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE, ENVIRONMENT } = getConfig();
  if (!DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE || ENVIRONMENT === "production") {
    return url;
  }

  const parsed = URL.parse(url);
  if (parsed?.hostname !== "docs.google.com") return url;

  return new URL(
    `${parsed.pathname}${parsed.search}`,
    DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE
  ).toString();
}
