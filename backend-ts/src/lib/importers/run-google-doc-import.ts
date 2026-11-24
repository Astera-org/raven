import { logger } from "#src/lib/logger.js";
import {
  type ImportedPublication,
  ImportedPublicationSchema,
  ImporterError,
} from "@raven/core-import-format";
import {
  type GoogleDocImportOptions,
  importGoogleDoc,
} from "@raven/importer-google-docs-markdown";
import { _applyDevGoogleDocsOriginOverride } from "./helpers/apply-dev-google-docs-origin-override.js";

/**
 * Converts a Google Doc and validates the result against the standard import
 * format, without going through the plugin registry.
 */
export async function runGoogleDocImport({
  url,
  signal,
  options,
}: {
  url: URL;
  signal: AbortSignal;
  options?: GoogleDocImportOptions;
}): Promise<ImportedPublication> {
  const raw = await importGoogleDoc(
    url,
    {
      fetch: (input, init) =>
        globalThis.fetch(
          input instanceof Request
            ? input
            : _applyDevGoogleDocsOriginOverride(input.toString()),
          init
        ),
      logger: logger.child({ importer: "gdoc" }),
      signal,
    },
    options
  );

  const parsed = ImportedPublicationSchema.safeParse(
    /**
     * @todo - these should be passed through in their full size and then saved
     * in an imports table TEXT field, so that they can be shown to authors,
     * rather than sliced here.
     */
    {
      ...raw,
      version: {
        ...raw.version,
        title: raw.version.title?.slice(0, 255),
        subtitle: raw.version.subtitle?.slice(0, 300),
      },
    }
  );
  if (!parsed.success) {
    throw new ImporterError(
      { code: "validation", issues: parsed.error.issues },
      "The Google Docs import returned an invalid publication"
    );
  }
  return parsed.data;
}
