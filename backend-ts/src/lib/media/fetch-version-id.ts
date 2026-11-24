import { createHash } from "node:crypto";
import { _applyDevMediaOriginOverride } from "./apply-dev-media-origin-override.js";
import { _extractGoogleDriveId } from "./extract-google-drive-id.js";

const log = console;

/**
 * Issue a HEAD request and return a version identifier for the remote file.
 *
 * Uses the `Last-Modified` header from the response, hashed to a short
 * string safe for use in S3 keys. Returns null for base64 data URIs or
 * when the server does not provide the header.
 */
export async function _fetchVersionId(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return null;

  let downloadUrl = url;
  const driveId = _extractGoogleDriveId(url);
  if (driveId) {
    downloadUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;
  }

  let response: Response;
  try {
    response = await fetch(_applyDevMediaOriginOverride(downloadUrl), {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (e) {
    log.warn(`HEAD request failed for ${url}: ${e}`);
    return null;
  }

  const rawValue = response.headers.get("Last-Modified");
  if (!rawValue) {
    log.warn(`No Last-Modified in HEAD response for ${url}`);
    return null;
  }

  return createHash("sha256").update(rawValue).digest("hex").slice(0, 12);
}
