import { runMystmdImport } from "#src/lib/importers/run-mystmd-import.js";
import { mystBuildWarnings } from "#src/lib/myst/build-warnings.js";
import { resolveContributors } from "#src/lib/publications/resolve-contributors.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { applicationError } from "#v1/lib/route-responses/error-content.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { canCreatePublication } from "./helpers/can-create-publication.js";
import { createPublication } from "./helpers/create-publication.js";
import { doiTakenIssue } from "./helpers/doi-taken-issue.js";
import { draftIssues } from "./helpers/draft-issues.js";
import { licenseChangeIssue } from "./helpers/license-change-issue.js";
import { type postPublicationsRoute } from "./post-publications.js";

/**
 * `POST /publications` with a MyST `importDocument`: the draft's fields come
 * from the document.
 */
export async function postPublicationsMystHandler(
  c: HandlerContext<typeof postPublicationsRoute>
): HandlerReturnType<typeof postPublicationsRoute> {
  const user = c.var.user;
  const repos = makeRepositories();
  if (!(await canCreatePublication(repos, user.id))) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const body = c.req.valid("json");
  if (!body.importDocument) {
    throw new Error("The MyST create handler needs an `importDocument`");
  }
  const myst = runMystmdImport(
    body.importDocument.body,
    body.importDocument.filename ?? null
  );
  if (myst.status === "invalid") {
    return c.var.validationErrors(myst.issues);
  }
  const { publication, version, importDocument } = myst.imported;
  const licenseIssue = licenseChangeIssue(publication.license, undefined);
  if (licenseIssue) {
    return c.var.validationErrors([licenseIssue]);
  }

  const doi = publication.doi ?? undefined;
  const doiTaken =
    doi !== undefined && (await repos.publications.isDoiTaken(doi));
  const { contributors, issues: contributorIssues } = await resolveContributors(
    repos,
    myst.imported.contributors,
    ["authors"]
  );

  const result = await createPublication(
    {
      title: version.title ?? undefined,
      subtitle: version.subtitle ?? undefined,
      abstract: version.abstract ?? undefined,
      body: version.body,
      license: publication.license,
      doi: doiTaken ? undefined : doi,
      slug: body.slug,
      versionDesc: body.versionDesc,
      feedbackFormEmbedSrc: body.feedbackFormEmbedSrc,
      socialPostsEmbedSrc: body.socialPostsEmbedSrc,
      orgs: body.orgs,
      tags: publication.tags,
      contributors,
      importDocument,
    },
    { ownerId: user.id, frontmatter: version.frontmatter }
  );
  if (result.status === "invalid") {
    return c.var.validationErrors(result.issues);
  }
  if (result.status === "error") {
    return c.json(
      applicationError({ mediaAssets: { message: result.error } }),
      result.code
    );
  }
  const created = {
    ...result.created,
    validationErrors: [
      ...draftIssues(
        [],
        [
          ...myst.warnings,
          ...contributorIssues,
          ...mystBuildWarnings({
            abstract: version.abstract,
            body: version.body,
            frontmatter: version.frontmatter,
          }),
          ...(doiTaken ? [doiTakenIssue()] : []),
        ]
      ),
      ...result.created.validationErrors,
    ],
  };
  return c.json(created, 201, {
    Location: `/api/v1/publications/id/${result.created.publicationId}`,
    ETag: result.etag,
  });
}
