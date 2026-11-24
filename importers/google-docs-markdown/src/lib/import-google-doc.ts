import { resolveDiagnosticMarkers } from "#src/lib/diagnostic-markers.js";
import { extractMedia } from "#src/lib/extract-media.js";
import { googleDocToMyst } from "#src/lib/import-google-docs-markdown.js";
import type { GoogleDocImportOptions } from "#src/types/google-docs.js";
import {
  type ImportedPublicationInput,
  type ImporterContext,
} from "@raven/core-import-format";

const GOOGLE_DOC_PATH = /^\/document\/d\/[^/]+/;

export function isGoogleDocUrl(url: URL): boolean {
  return (
    url.hostname === "docs.google.com" && GOOGLE_DOC_PATH.test(url.pathname)
  );
}

export async function importGoogleDoc(
  url: URL,
  context: ImporterContext,
  options: GoogleDocImportOptions = {}
): Promise<ImportedPublicationInput> {
  // ERROR-SITE(may-throw): only ImporterErrors. Fetch failures and aborts
  // arrive as fetch-error/read-error, and anything the converter couldn't work
  // around as conversion-failed.
  // Despite the name, this isn't standard MyST: the docs call it the
  // "Google Docs format" (docs/thestacks/authors/index.md).
  const doc = await googleDocToMyst(url.href, context, options);
  const { body: markedBody, media } = extractMedia(doc.myst, doc.diagnostics);
  // Resolved last, so ranges point into the text that's actually stored.
  const { fields, diagnostics } = resolveDiagnosticMarkers(
    {
      title: doc.title,
      subtitle: doc.subtitle ?? "",
      abstract: doc.abstract,
      body: markedBody,
    },
    {
      title: ["title"],
      subtitle: ["subtitle"],
      abstract: ["abstract"],
      body: ["body"],
    },
    doc.diagnostics.pending
  );
  const fallbackTitle = doc.filename?.replace(/\.gdoc$/, "") || "Untitled";
  if (!fields.title) {
    diagnostics.push({
      code: "missing-title",
      severity: "warning",
      message: `The document has no title; using "${fallbackTitle}"`,
      path: ["title"],
    });
  }

  return {
    version: {
      title: fields.title || fallbackTitle,
      subtitle: fields.subtitle || null,
      abstract: fields.abstract || null,
      body: fields.body,
    },
    importDocument: {
      format: "gdoc",
      body: doc.html,
      url: url.href,
      filename: doc.filename,
    },
    media,
    diagnostics,
  };
}
