import { IMPORT_LICENSES, type ImportLicense } from "./imported-publication.js";

/** SPDX identifiers for every license a publication can store. */
export const LICENSE_SPDX_IDENTIFIERS: Record<ImportLicense, string> = {
  "CC BY": "CC-BY-4.0",
  "CC BY-SA": "CC-BY-SA-4.0",
  "CC BY-ND": "CC-BY-ND-4.0",
  "CC BY-NC": "CC-BY-NC-4.0",
  "CC BY-NC-SA": "CC-BY-NC-SA-4.0",
  "CC BY-NC-ND": "CC-BY-NC-ND-4.0",
  CC0: "CC0-1.0",
};

/** The license stored on a publication for an SPDX identifier, in any case. */
export function licenseFromSpdx(spdxIdentifier: string): ImportLicense | null {
  return (
    IMPORT_LICENSES.find(
      (license) =>
        LICENSE_SPDX_IDENTIFIERS[license].toLowerCase() ===
        spdxIdentifier.toLowerCase()
    ) ?? null
  );
}
