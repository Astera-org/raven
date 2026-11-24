import { _shouldUploadMedia } from "./should-upload-media.js";

// Container directive src attribute: {src=url}, {src="url"}, {src='url'}.
const MEDIA_DIRECTIVE_PATTERN =
  /^:::+(\w+)\{[^}]*src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))[^}]*\}/gm;

/**
 * Looks for media URLs in container directive attributes (e.g., :::image{src=...}).
 * Supports quoted and unquoted regular URLs.
 *
 * Note: URLs are filtered via `_shouldUploadMedia()` (Google domain allowlist), so
 * base64 `data:` URIs are intentionally excluded here.
 */
export function _extractMediaUrlsToUpload(
  body: string
): { url: string; figureType: string }[] {
  const urls: { url: string; figureType: string }[] = [];
  for (const match of body.matchAll(MEDIA_DIRECTIVE_PATTERN)) {
    const figureType = match[1]!;
    const url = match[2] || match[3] || match[4];
    if (
      // If found
      url &&
      // If it match our restrictions
      _shouldUploadMedia(url, figureType) &&
      // If it isn't a duplicate
      !urls.find((u) => u.url === url)
    ) {
      urls.push({ url, figureType });
    }
  }
  return Array.from(new Set(urls));
}
