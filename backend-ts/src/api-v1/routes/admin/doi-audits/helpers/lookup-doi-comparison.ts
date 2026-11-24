import { type Repositories } from "#v1/db-repositories/index.js";
import { type DoiAuditPublicationRow } from "#v1/db-repositories/publications-repository.js";
import { type DoiComparisonType } from "#v1/routes/admin/doi-audits/route-requests/get-doi-comparison.js";
import { type AdminScope } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { compareCanonicalDoiMetadata } from "./compare-canonical-doi-metadata.js";
import { compareVersionDoiMetadata } from "./compare-version-doi-metadata.js";
import { reconstructPublicationMetadata } from "./reconstruct-publication-metadata.js";
import { type MetadataComparisonResult } from "./to-comparable.js";

export type DoiComparisonLookup =
  | {
      ok: true;
      publication: DoiAuditPublicationRow;
      orgName: string | null;
      result: MetadataComparisonResult;
    }
  | {
      ok: false;
      reason: "publication-not-found" | "not-published" | "not-latest-version";
    };

type DoiLookupFailure = Extract<DoiComparisonLookup, { ok: false }>["reason"];
type DoiLookupError =
  | { doi: { message: string } }
  | { publication: { message: string } };

/**
 * The errors for a failed lookup's 404, shared by the routes that look a DOI
 * up so they report the same failure the same way.
 */
export function toDoiLookupError(reason: DoiLookupFailure): DoiLookupError {
  if (reason === "not-latest-version") {
    return {
      doi: {
        message: "This DOI is not the publication's current latest version DOI",
      },
    };
  }
  return {
    publication: {
      message:
        reason === "publication-not-found"
          ? "No publication found for this DOI"
          : "Publication has no canonical DOI or published version",
    },
  };
}

/**
 * Finds the publication a DOI belongs to within the scope and compares the
 * DOI's DataCite record with the metadata The Stacks would send for it. A DOI
 * outside the scope is not found rather than forbidden.
 */
export async function lookupDoiComparison(
  repos: Repositories,
  scope: AdminScope,
  type: DoiComparisonType,
  doi: string
): Promise<DoiComparisonLookup> {
  // Scoped before any reconstruction or DataCite call, so an org admin can't
  // trigger either for a publication outside their orgs.
  const publication = await repos.publications.findAdministeredByDoi(
    scope,
    type,
    doi
  );
  if (!publication) return { ok: false, reason: "publication-not-found" };

  const [primaryOrg, reconstructed] = await Promise.all([
    repos.publications.findPrimaryOrg(publication.id),
    reconstructPublicationMetadata(repos, publication, {
      comparisonType: type,
    }),
  ]);
  if (!reconstructed) return { ok: false, reason: "not-published" };

  // reconstructPublicationMetadata always reconstructs the latest version,
  // which may no longer match this DOI if a newer one published since --
  // require an exact match rather than compare against the wrong version.
  if (
    type === "version" &&
    reconstructed.versionDoi?.toLowerCase() !== doi.toLowerCase()
  ) {
    return { ok: false, reason: "not-latest-version" };
  }

  const result = await (type === "canonical"
    ? compareCanonicalDoiMetadata(
        reconstructed.canonicalDoi,
        reconstructed.canonicalMeta,
        reconstructed.versionMeta
      )
    : compareVersionDoiMetadata(doi, reconstructed.versionMeta));

  return { ok: true, publication, orgName: primaryOrg?.name ?? null, result };
}
