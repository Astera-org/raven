import { type LICENSES } from "#src/db/schema.js";
import { LICENSE_SPDX_IDENTIFIERS } from "@raven/core-import-format";

export interface LicenseInfo {
  /** Full display name including version, e.g. "CC BY 4.0". */
  name: string;
  /** Canonical URL for the license deed. */
  link: string;
  /** Full name as used in a formal rights statement (e.g. to DataCite),
   * e.g. "Creative Commons Attribution 4.0 International". */
  rightsStatement: string;
  /** SPDX license identifier, e.g. "CC-BY-4.0". */
  spdxIdentifier: string;
}

export const DEFAULT_LICENSE = "CC BY";

/**
 * Registry of supported licenses, keyed by the code stored on a publication.
 */
const licenses: Record<string, LicenseInfo> = {
  "CC BY": {
    name: "CC BY 4.0",
    link: "https://creativecommons.org/licenses/by/4.0/",
    rightsStatement: "Creative Commons Attribution 4.0 International",
    spdxIdentifier: "CC-BY-4.0",
  },
  CC0: {
    name: "CC0 1.0",
    link: "https://creativecommons.org/publicdomain/zero/1.0/",
    rightsStatement: "CC0 1.0 Universal",
    spdxIdentifier: "CC0-1.0",
  },
};

export function getLicense(
  license: string | null | undefined
): LicenseInfo | null {
  if (!license) return null;
  return licenses[license] ?? null;
}

export function licenseToSpdx(
  license: string | null | undefined
): string | null {
  return license && Object.hasOwn(LICENSE_SPDX_IDENTIFIERS, license)
    ? LICENSE_SPDX_IDENTIFIERS[license as (typeof LICENSES)[number]]
    : null;
}

/** Whether new publications may choose this license. */
export function isSupportedLicense(license: string): boolean {
  return Object.hasOwn(licenses, license);
}

export function supportedSpdxIdentifiers(): string[] {
  return Object.values(licenses).map((info) => info.spdxIdentifier);
}

export function licenseToLink(
  license: string | null | undefined
): string | null {
  return getLicense(license)?.link ?? null;
}

export function licenseToDisplayName(
  license: string | null | undefined
): string | null {
  if (!license) return null;
  return getLicense(license)?.name ?? license;
}
