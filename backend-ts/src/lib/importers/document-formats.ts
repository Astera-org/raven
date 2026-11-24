import { MYSTMD_FORMAT } from "@raven/importer-mystmd";

/** The `content.format` of MyST content: clients render it from the MyST AST. */
export const MYST_CONTENT_FORMAT = "myst";

/**
 * Formats whose stored document is the authority for the draft: the draft's
 * fields come from it, and it's kept as sent, so its media isn't uploaded. It
 * has to keep describing the draft.
 */
const AUTHORITATIVE_DOCUMENT_FORMATS: readonly string[] = [MYSTMD_FORMAT];

export function isAuthoritativeDocumentFormat(
  format: string | null | undefined
): boolean {
  return format != null && AUTHORITATIVE_DOCUMENT_FORMATS.includes(format);
}

/**
 * The format clients render a version's content in (`content.format`), from
 * the format it's stored with. They differ for MyST Markdown, which clients
 * get as the MyST AST.
 */
export function contentFormat(
  importDocumentFormat: string | null | undefined
): string | null {
  if (!importDocumentFormat) return null;
  return importDocumentFormat === MYSTMD_FORMAT
    ? MYST_CONTENT_FORMAT
    : importDocumentFormat;
}

/** Whether a version's content is MyST, rendered from the MyST AST. */
export function isMystContent(
  importDocumentFormat: string | null | undefined
): boolean {
  return contentFormat(importDocumentFormat) === MYST_CONTENT_FORMAT;
}
