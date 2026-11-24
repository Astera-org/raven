import { type PublicationResponse } from "#v0/types/response.js";
import dayjs from "dayjs";

/**
 * Note: This contains duplicate functionality that is defined in the frontend.
 * Until we move to a monorepo we will need to have these duplicate definitions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting utilities
// ─────────────────────────────────────────────────────────────────────────────

export function dateToSlashYYYYMMDD(
  dateStr: string | null | undefined
): string | null {
  if (!dateStr) return null;
  return dayjs(dateStr).format("YYYY/MM/DD");
}

export function dateToDashYYYYMMDD(
  dateStr: string | null | undefined
): string | null {
  if (!dateStr) return null;
  return dayjs(dateStr).format("YYYY-MM-DD");
}

export function dateToIso8601(
  dateStr: string | null | undefined
): string | null {
  if (!dateStr) return null;
  return dayjs(dateStr).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Contributor utilities
// ─────────────────────────────────────────────────────────────────────────────

function contributorToObject(
  contributor: PublicationResponse["contributors"][0]
) {
  const full_name = `${contributor.first_name ?? ""} ${
    contributor.last_name ?? ""
  }`.trim();
  // TODO Add email, institution, ORCID if available
  return { full_name, user_id: contributor.user_id };
}

function contributorObjectsToUnique(
  contributors: ReturnType<typeof contributorToObject>[]
) {
  const seen = new Set<number>();
  const unique = contributors.filter((c) => {
    if (seen.has(c.user_id)) {
      return false;
    } else {
      seen.add(c.user_id);
      return true;
    }
  });

  return unique;
}

export function contributorsToAuthors(publication: PublicationResponse | null) {
  if (!publication) return [];
  let contributorObjects =
    publication.contributors
      ?.filter((c) => c.in_byline)
      .map(contributorToObject) ?? [];
  if (contributorObjects.length === 0 && publication.contributors != null) {
    // If no byline contributors, fall back to all contributors
    contributorObjects = publication.contributors.map(contributorToObject);
  }
  return contributorObjectsToUnique(contributorObjects);
}

export function publicationUrls(
  publication: PublicationResponse | null,
  selectedVersionNum: number | null,
  baseUrl: string = "https://thestacks.org"
) {
  if (!publication) {
    return {
      basePublicationUrl: baseUrl,
      versionedPublicationUrl: baseUrl,
    };
  }
  const verPart =
    selectedVersionNum && !Number.isNaN(selectedVersionNum)
      ? `/v${selectedVersionNum}`
      : "";
  // the URLs should be absolute
  const basePublicationUrl = `${baseUrl}/publications/${publication.slug}`;
  const versionedPublicationUrl = `${basePublicationUrl}${verPart}`;
  return {
    basePublicationUrl,
    versionedPublicationUrl,
  };
}
