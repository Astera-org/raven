import { MediaUnavailableError } from "#src/lib/errors/media-unavailable-error.js";

const log = console;

export class DriveAccessError extends MediaUnavailableError {
  override name = "DriveAccessError";
}

/**
 * Get filename from Google Drive by scraping the file page.
 */
export async function _getGoogleDriveFilename(
  fileId: string
): Promise<string | null> {
  const pageUrl = `https://drive.google.com/file/d/${fileId}/view`;
  try {
    const response = await fetch(pageUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    if (
      response.url.includes("accounts.google.com") ||
      response.url.includes("ServiceLogin")
    ) {
      throw new DriveAccessError(
        `Google Drive file ${pageUrl} is not publicly accessible.`
      );
    }

    const text = await response.text();

    const titleMatch = text.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
      const title = titleMatch[1]!;
      if (title.includes("Sign in") || title.includes("Login")) {
        throw new DriveAccessError(
          `Google Drive file ${pageUrl} is not publicly accessible.`
        );
      }

      const filename = title.replace(/\s*-\s*Google Drive\s*$/, "").trim();
      if (filename && filename.includes(".")) return filename;
    }

    const metaMatch = text.match(/<meta property="og:title" content="([^"]+)"/);
    if (metaMatch) {
      const filename = metaMatch[1]!.trim();
      if (filename && filename.includes(".")) return filename;
    }
  } catch (e) {
    if (e instanceof DriveAccessError) throw e;
    log.warn(`Failed to get filename from Drive page for ${pageUrl}`);
  }

  return null;
}
