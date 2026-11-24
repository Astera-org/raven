import { getConfig } from "#src/config.js";

/**
 * Redirects googleusercontent.com media downloads to DEV_MEDIA_ORIGIN_OVERRIDE
 * when it's set, so a locally run backend can use the integration tests' media
 * mock. Only the fetched URL changes; the original URL is still what gets
 * allowlisted, hashed into the S3 key, and stored as the asset's origin.
 */
export function _applyDevMediaOriginOverride(url: string): string {
  const { DEV_MEDIA_ORIGIN_OVERRIDE, ENVIRONMENT } = getConfig();
  if (!DEV_MEDIA_ORIGIN_OVERRIDE || ENVIRONMENT === "production") return url;

  const parsed = URL.parse(url);
  if (!parsed?.hostname.endsWith("googleusercontent.com")) return url;

  return new URL(
    `${parsed.pathname}${parsed.search}`,
    DEV_MEDIA_ORIGIN_OVERRIDE
  ).toString();
}
