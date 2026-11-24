import { type Publication } from "#src/db/schema.js";
import { createVersionImport } from "#src/lib/importers/create-version-import.js";
import { runMystmdImport } from "#src/lib/importers/run-mystmd-import.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { mystBuildWarnings } from "#src/lib/myst/build-warnings.js";
import { extractAndStoreVersionReferences } from "#src/lib/references.js";
import {
  isDuplicateEntryError,
  isLockConflictError,
} from "#src/lib/utils/db-errors.js";
import {
  makeRepositories,
  type Repositories,
} from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { z } from "@hono/zod-openapi";
import { addContributors } from "./helpers/add-contributors.js";
import { doiTakenIssue } from "./helpers/doi-taken-issue.js";
import { ifMatchSatisfied, loadDraftEtag } from "./helpers/draft-etag.js";
import { draftIssues } from "./helpers/draft-issues.js";
import { draftLinks } from "./helpers/draft-links.js";
import { getOrCreateDraft } from "./helpers/get-or-create-draft.js";
import { getReadiness } from "./helpers/get-readiness.js";
import { licenseChangeIssue } from "./helpers/license-change-issue.js";
import { updateAllTags } from "./helpers/update-all-tags.js";
import { updatePublication } from "./helpers/update-publication.js";
import { CreatePublicationBodySchema } from "./route-requests/post-publications.js";
import { CreatePublicationResponseSchema } from "./route-responses/create-draft.js";

const ResponseHeadersSchema = z.object({
  ETag: z.string().openapi({
    description: "The draft's new ETag, for `If-Match` on the next write.",
  }),
});

export const putDraftContentRoute = createAuthedRoute({
  method: "put",
  path: "/id/{id}/draft/content",
  tags: ["publications"],
  summary: "Replace the draft's MyST content",
  description:
    "Replaces the draft with a MyST document, creating the draft if none " +
    "is open. Its frontmatter `title`, `subtitle`, `abstract` and the body " +
    "replace the draft's; `keywords` replace the tags. `license` and `doi` " +
    "are only changed when given: a published publication keeps its " +
    "license, and a DOI is only recorded on a never-published publication " +
    "that has none, and only if no other publication has it. `authors` " +
    "who are Stacks users are added to the end of the byline; nobody else " +
    "is, so a draft without them can't be published until someone is. " +
    "With `If-Match`, the write only happens if the draft still has that " +
    "ETag; without it, the draft is overwritten unconditionally.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
    query: z.object({
      filename: z.string().min(1).optional().openapi({
        description: "Name of the MyST source file, stored with the source.",
        example: "paper.md",
      }),
    }),
    headers: z.object({
      "if-match": z.string().optional().openapi({
        description: "The draft's ETag from the last read or write.",
      }),
    }),
    body: {
      required: true,
      content: {
        "text/markdown": {
          schema: z.string().openapi({
            description: "A standard MyST document.",
            example: "---\ntitle: A study\nlicense: CC-BY-4.0\n---\n\nBody.",
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The draft was replaced.",
      headers: ResponseHeadersSchema,
      content: {
        "application/json": { schema: CreatePublicationResponseSchema },
      },
    },
    201: {
      description: "A new draft was created from the document.",
      headers: ResponseHeadersSchema.extend({
        Location: z.string().openapi({
          description: "The new draft, `.../id/{id}/draft`.",
        }),
      }),
      content: {
        "application/json": { schema: CreatePublicationResponseSchema },
      },
    },
    403: {
      description:
        "The authenticated user does not have edit permission on this " +
        "publication.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication exists for the given ID, or it has no version.",
      content: errorContent("publication", "version"),
    },
    409: {
      description:
        "The draft comes from a Google Doc; replacing it with MyST isn't " +
        "supported. Or another push or a publish of this publication held " +
        "it for too long, or would have deadlocked with this one; " +
        "concurrent pushes otherwise run one after another, and the last " +
        "one wins.",
      content: errorContent("draft"),
    },
    412: {
      description:
        "`If-Match` doesn't match the draft's ETag: it was changed since. " +
        "`GET .../id/{id}/draft` returns its current fields.",
      content: errorContent("draft"),
    },
    415: {
      description: "The body isn't `text/markdown`.",
      content: errorContent(),
    },
  },
});

/**
 * `@hono/zod-openapi` only validates JSON and form bodies, so this checks the
 * content type itself and reads the raw text with `c.req.text()`.
 */
export async function putDraftContentHandler(
  c: HandlerContext<typeof putDraftContentRoute>
): HandlerReturnType<typeof putDraftContentRoute> {
  const user = c.var.user;
  if (
    !c.req.header("content-type")?.toLowerCase().startsWith("text/markdown")
  ) {
    return c.json(
      applicationError({ root: { message: "Unsupported Media Type" } }),
      415
    );
  }

  const { id } = c.req.valid("param");
  const repos = makeRepositories();
  const publication = await repos.publications.findById(id, {
    includeDeleted: false,
  });
  if (!publication) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }
  if (!(await repos.publications.canEdit(user.id, id, publication.ownerId))) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const source = await c.req.text();
  const filename = c.req.valid("query").filename ?? null;
  const myst = runMystmdImport(source, filename);
  if (myst.status === "invalid") {
    return c.var.validationErrors(myst.issues);
  }
  const {
    publication: imported,
    version,
    contributors,
    importDocument,
  } = myst.imported;
  const { license, tags: keywords } = imported;
  const doi = imported.doi ?? undefined;
  const warnings: ValidationIssue[] = [...myst.warnings];
  const versionFields = {
    title: version.title ?? undefined,
    subtitle: version.subtitle ?? undefined,
    abstract: version.abstract ?? undefined,
    body: version.body,
  };
  const parsed = CreatePublicationBodySchema.safeParse({
    ...versionFields,
    doi,
  });
  if (!parsed.success) {
    return c.var.validationErrors(parsed.error.issues);
  }
  const licenseIssue = licenseChangeIssue(license, publication.license);
  if (licenseIssue) {
    return c.var.validationErrors([licenseIssue]);
  }

  const ifMatch = c.req.valid("header")["if-match"];

  let pushed;
  try {
    pushed = await repos.transaction(async (txRepos) => {
      // Locked before anything is read, so the reads below see every push and
      // publish that committed while this one waited. Pushes to a publication
      // run one after another and the last one wins. If-Match is compared, not
      // consumed: of concurrent pushes holding the same ETag, a later one
      // fails only if an earlier one changed the draft's ETag. Publishing
      // locks this row too, so a push never writes into a draft that was
      // just published.
      const latest = await txRepos.publications.findForUpdate(id);
      if (!latest || latest.state === "DELETED") {
        return {
          error: c.json(
            applicationError({
              publication: { message: "Publication not found" },
            }),
            404
          ),
        };
      }

      // A new draft starts as a copy of the latest version, so that version
      // is what `If-Match` is checked against when no draft is open.
      const current =
        (await txRepos.versions.findDraftForPublication(id)) ??
        (await txRepos.versions.findByVersionNumberOfPublication(
          id,
          latest.latestVersionNumber
        ));
      if (!current) {
        return {
          error: c.json(
            applicationError({
              version: { message: "Publication has no version" },
            }),
            404
          ),
        };
      }
      if (current.importDocumentFormat === "gdoc") {
        return {
          error: c.json(
            applicationError({
              draft: {
                message:
                  "The draft comes from a Google Doc and can't be replaced",
              },
            }),
            409
          ),
        };
      }
      if (
        ifMatch !== undefined &&
        !ifMatchSatisfied(
          ifMatch,
          await loadDraftEtag(txRepos, latest, current)
        )
      ) {
        return {
          error: c.json(
            applicationError({
              draft: {
                message:
                  "The draft was changed since that ETag; get its current " +
                  `fields from /api/v1/publications/id/${id}/draft`,
              },
            }),
            412
          ),
        };
      }

      const draftResult = await getOrCreateDraft(txRepos, latest);
      if (draftResult.status === "missing-latest-version") {
        return {
          error: c.json(
            applicationError({
              version: { message: "Publication has no version" },
            }),
            404
          ),
        };
      }
      const { draft } = draftResult;

      if (doi && doi !== latest.doi) {
        warnings.push(...(await recordDoi(txRepos, latest, doi)));
      }

      await txRepos.versions.update(draft.id, {
        title: versionFields.title ?? null,
        subtitle: versionFields.subtitle ?? null,
        abstract: versionFields.abstract ?? null,
        body: versionFields.body,
        frontmatter: version.frontmatter,
        importDocumentBody: importDocument.body,
        importDocumentUrl: importDocument.url,
        importDocumentFilename: importDocument.filename,
        importDocumentFormat: importDocument.format,
        importDocumentSyncDate: new Date(),
      });
      await createVersionImport(txRepos, {
        versionId: draft.id,
        ...importDocument,
      });

      if (license && license !== latest.license) {
        const { fieldErrors } = await updatePublication(
          id,
          { license },
          latest.state === "PUBLISHED",
          txRepos
        );
        warnings.push(...Object.values(fieldErrors));
      }
      await updateAllTags(id, keywords, txRepos);
      warnings.push(
        ...(await addContributors(draft.id, contributors, ["authors"], txRepos))
      );

      const readiness = await getReadiness(txRepos, id, draft.id);
      const [updated, updatedPublication] = await Promise.all([
        txRepos.versions.findById(draft.id),
        txRepos.publications.findById(id),
      ]);
      const etag = await loadDraftEtag(txRepos, updatedPublication!, updated!);
      return {
        draft,
        created: draftResult.status === "created",
        etag,
        readiness,
      };
    });
  } catch (e) {
    if (!isLockConflictError(e)) throw e;
    return c.json(
      applicationError({
        draft: {
          message:
            "Another push or publish of this draft is taking too long; try again",
        },
      }),
      409
    );
  }
  if (pushed.error) return pushed.error;
  const { draft, created, etag, readiness } = pushed;

  // After the commit: references are written on a separate connection.
  await extractAndStoreVersionReferences(draft.idInt, {
    format: importDocument.format,
    abstract: versionFields.abstract,
    body: versionFields.body,
    bibliography: draft.bibliography,
    frontmatter: version.frontmatter,
  }).catch((e) =>
    c.var.logger.error({ err: e }, "Failed to extract and store references")
  );
  warnings.push(
    ...mystBuildWarnings({
      abstract: versionFields.abstract,
      body: versionFields.body,
      // A push leaves the bibliography alone, so the citations it resolves
      // are the ones the stored files define.
      bibliography: draft.bibliography,
      frontmatter: version.frontmatter,
    })
  );

  const response = {
    publicationId: id,
    slug: publication.slug,
    versionId: draft.id,
    validationErrors: draftIssues(readiness.error?.issues ?? [], warnings),
    links: draftLinks(id),
  };
  if (created) {
    return c.json(response, 201, {
      ETag: etag,
      Location: `/api/v1/publications/id/${id}/draft`,
    });
  }
  return c.json(response, 200, { ETag: etag });
}

async function recordDoi(
  repos: Repositories,
  publication: Publication,
  doi: string
): Promise<ValidationIssue[]> {
  if (publication.state === "PUBLISHED" || publication.doi) {
    return [
      {
        code: "custom",
        path: ["doi"],
        message:
          "The DOI wasn't changed: it can only be set on a publication " +
          "that has never been published and has no DOI",
      },
    ];
  }
  try {
    await repos.publications.update(publication.id, { doi });
    return [];
  } catch (e) {
    if (!isDuplicateEntryError(e)) throw e;
    return [doiTakenIssue()];
  }
}
