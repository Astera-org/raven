import { type z } from "@hono/zod-openapi";
import { isGoogleDocUrl } from "@raven/importer-google-docs-markdown";
import { type ImportFormatSchema } from "./route-requests/post-imports-request-schema.js";

type ConcreteImportFormat = Exclude<
  z.infer<typeof ImportFormatSchema>["type"],
  "auto"
>;

export function detectImportFormat(url: URL): ConcreteImportFormat | null {
  return isGoogleDocUrl(url) ? "gdoc" : null;
}
