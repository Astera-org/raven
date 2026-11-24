// Maps a mime type to the extension used when guessing from a Content-Type
// header or a base64 data URI. Anything not covered here falls back to .png,
// mirroring media_utils.py's mimetypes.guess_extension() + fallback dict.
export const MIME_TO_EXTENSION: Record<string, string> = {
  "video/x-msvideo": ".avi",
  "video/quicktime": ".mov",
  "video/mp4": ".mp4",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "text/html": ".html",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "application/pdf": ".pdf",
};

// Inverse of MIME_TO_EXTENSION, used when guessing a Content-Type from a
// file's extension for the S3 upload.
export const EXTENSION_TO_MIME: Record<string, string> = {
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".html": "text/html",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
};
