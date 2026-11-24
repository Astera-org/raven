import { type PublicationResponse } from "#v1/routes/publications/route-responses/publication.js";

function contributorToObject(
  contributor: PublicationResponse["contributors"][0]
) {
  const fullName = `${contributor.firstName ?? ""} ${
    contributor.lastName ?? ""
  }`.trim();
  // TODO Add email, institution, ORCID if available
  return { fullName, userId: contributor.userId };
}

function contributorObjectsToUnique(
  contributors: ReturnType<typeof contributorToObject>[]
) {
  const seen = new Set<string>();
  const unique = contributors.filter((c) => {
    if (seen.has(c.userId)) {
      return false;
    } else {
      seen.add(c.userId);
      return true;
    }
  });

  return unique;
}
export function contributorsToAuthors(publication: PublicationResponse | null) {
  if (!publication) return [];
  let contributorObjects =
    publication.contributors
      ?.filter((c) => c.inByline)
      .map(contributorToObject) ?? [];
  if (contributorObjects.length === 0 && publication.contributors != null) {
    // If no byline contributors, fall back to all contributors
    contributorObjects = publication.contributors.map(contributorToObject);
  }
  return contributorObjectsToUnique(contributorObjects);
}
