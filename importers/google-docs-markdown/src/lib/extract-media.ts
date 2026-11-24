import {
  FIGURE_TYPES,
  type FigureType,
  type ImportedMedia,
  type ImportedMediaSource,
  mediaRef,
} from "@raven/core-import-format";
import { ulid } from "ulid";
import {
  type DiagnosticCollector,
  endMarker,
  startMarker,
} from "./diagnostic-markers.js";

// Container directive src attribute: {src=url}, {src="url"}, {src='url'}. A
// quoted value is matched up to its closing quote, so a bad one with spaces in
// it (e.g. template text left in place) is reported whole.
const MEDIA_DIRECTIVE_PATTERN =
  /^(:::+(\w+)\{[^}]*src\s*=\s*)(?:"([^"\n]*)"|'([^'\n]*)'|([^"'\s}]+))/gm;

// Raven's frontend can't reliably load media from these hosts, so it's copied
// to Raven's storage. Media elsewhere (e.g. Typeform iframes) must stay put.
const UPLOAD_HOSTS = [
  "docs.google.com",
  "drive.google.com",
  "googleusercontent.com",
];

const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/s;

// Extensions for the types Google embeds as data: URLs, which give the
// uploaded file its name.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
};

/**
 * Replaces the `src` of each media directive that should be copied to Raven
 * with a media ref, returning the rewritten body and the media to upload.
 * Repeated sources share one ref. Embedded `data:` media is decoded into a
 * `bytes` source. A src that isn't a full URL, or embedded data that can't be
 * read, is reported to `diagnostics` and left as is.
 */
export function extractMedia(
  myst: string,
  diagnostics: DiagnosticCollector
): {
  body: string;
  media: ImportedMedia[];
} {
  const refByUrl = new Map<string, ImportedMedia>();

  const body = myst.replace(
    MEDIA_DIRECTIVE_PATTERN,
    (
      match,
      prefix: string,
      name: string,
      doubleQuoted: string | undefined,
      singleQuoted: string | undefined,
      unquoted: string | undefined
    ) => {
      if (!isFigureType(name)) return match;
      const url = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
      const quote =
        doubleQuoted !== undefined
          ? '"'
          : singleQuoted !== undefined
            ? "'"
            : "";
      const withSrc = (src: string) => `${prefix}${quote}${src}${quote}`;
      const keepWithDiagnostic = (
        diagnostic: Parameters<DiagnosticCollector["report"]>[0]
      ) => {
        const id = diagnostics.report(diagnostic);
        return withSrc(`${startMarker(id)}${url}${endMarker(id)}`);
      };

      let media = refByUrl.get(url);
      if (!media) {
        let source: ImportedMediaSource;
        if (url.startsWith("data:")) {
          const decoded = decodeDataUrl(url, name, refByUrl.size + 1);
          if (!decoded) {
            return keepWithDiagnostic({
              code: "media-invalid-data",
              severity: "warning",
              message: `This ${name}'s embedded data couldn't be read, so it couldn't be copied to Raven.`,
            });
          }
          source = decoded;
        } else {
          const parsed = URL.parse(url);
          if (!parsed) {
            return keepWithDiagnostic({
              code: "media-invalid-src",
              severity: "warning",
              message: `This ${name}'s source isn't a full URL, so it couldn't be copied to Raven and may not load.`,
            });
          }
          if (!shouldUpload(parsed)) return match;
          source = { type: "url", url };
        }
        media = { ref: mediaRef(ulid()), source, figureType: name };
        refByUrl.set(url, media);
      }
      return withSrc(media.ref);
    }
  );

  return { body, media: [...refByUrl.values()] };
}

/**
 * Decodes a base64 `data:` URL of a known media type, named after its figure
 * type and position (e.g. `image-3.png`). Returns null if it can't be read.
 */
function decodeDataUrl(
  url: string,
  figureType: FigureType,
  position: number
): Extract<ImportedMediaSource, { type: "bytes" }> | null {
  const [, mimeType, base64] = url.match(DATA_URL_PATTERN) ?? [];
  const extension = mimeType && EXTENSION_BY_MIME_TYPE[mimeType.toLowerCase()];
  if (!base64 || !extension) return null;

  const data = Buffer.from(base64, "base64");
  if (data.length === 0) return null;
  return {
    type: "bytes",
    data,
    filename: `${figureType}-${position}${extension}`,
    mimeType: mimeType.toLowerCase(),
  };
}

function isFigureType(name: string): name is FigureType {
  return (FIGURE_TYPES as readonly string[]).includes(name);
}

function shouldUpload(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  // `lh3.googleusercontent.com` should match `googleusercontent.com`.
  const domain = hostname.split(".").slice(-2).join(".");
  return UPLOAD_HOSTS.includes(hostname) || UPLOAD_HOSTS.includes(domain);
}
