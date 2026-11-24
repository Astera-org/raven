import { ALLOWED_MEDIA_EXTENSIONS } from "./allowed-media-extensions.js";

export function _validateExtension(extension: string): boolean {
  return ALLOWED_MEDIA_EXTENSIONS.has(extension.toLowerCase());
}
