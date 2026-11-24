import { type LICENSES } from "#src/db/schema.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import {
  isSupportedLicense,
  licenseToSpdx,
  supportedSpdxIdentifiers,
} from "#src/lib/utils/licenses.js";

/**
 * A license may be set if new publications may choose it, or if the
 * publication already has it, so a document fetched from the server can be
 * pushed back unchanged.
 */
export function licenseChangeIssue(
  license: (typeof LICENSES)[number] | undefined,
  currentLicense: string | null | undefined
): ValidationIssue | undefined {
  if (!license || license === currentLicense || isSupportedLicense(license)) {
    return undefined;
  }
  const spdx = licenseToSpdx(license) ?? license;
  return {
    code: "custom",
    path: ["license"],
    message: `Unsupported license "${spdx}"; use one of ${supportedSpdxIdentifiers().join(", ")}`,
  };
}
