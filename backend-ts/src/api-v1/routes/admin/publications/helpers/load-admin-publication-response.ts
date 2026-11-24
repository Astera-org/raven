import { type Publication, type Version } from "#src/db/schema.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { buildAdminPublicationResponse } from "./build-admin-publication-response.js";

/**
 * Loads what the admin view of `pub` at `version` lists, then builds it.
 * Shared by the detail and update routes, which both serve the version
 * `findAdministered` resolved.
 */
export async function loadAdminPublicationResponse(
  repos: Repositories,
  pub: Publication,
  version: Version
) {
  const [versionRows, contributorRows, commentsCount] = await Promise.all([
    repos.versions.list(pub.id, true),
    repos.contributors.listByVersionId(version.id),
    repos.publications.countComments(pub.id),
  ]);
  return buildAdminPublicationResponse(pub, version, {
    versionRows,
    contributorRows,
    commentsCount,
  });
}
