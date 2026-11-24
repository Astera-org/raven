const DOMAINS_ALLOWLIST = [
  "docs.google.com",
  "drive.google.com",
  "googleusercontent.com",
];

/**
 * Decides which media should be uploaded to S3.
 *
 * Some media should never be uploaded, e.g. Typeform iframes need to be hosted
 * on Typeform's domain to work, so copying them to S3 would be a mistake.
 *
 * Other media should always be uploaded, e.g. images in Google Docs or Drive,
 * because requests to Docs/Drive from The Stacks's frontend may get blocked.
 */
export function _shouldUploadMedia(url: string, figureType: string): boolean {
  if (!["audio", "iframe", "image", "video"].includes(figureType)) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (DOMAINS_ALLOWLIST.some((d) => d === hostname)) {
      return true;
    }

    // Turns `(\w+\.)+\w+` into `\w+\.\w+`, e.g. `bucket.s3.amazonaws.com`
    // would become `amazonaws.com` and `google.com` will stay `google.com`
    // and likewise `localhost` will stay `localhost`.
    // This is for checking `googleusercontent.com` safely.
    const domainName = hostname.split(".").slice(-2).join(".");
    return DOMAINS_ALLOWLIST.some((d) => d === domainName);
  } catch {
    return false;
  }
}
