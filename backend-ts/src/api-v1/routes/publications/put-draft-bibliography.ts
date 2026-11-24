import { getConfig } from "#src/config.js";
import { type VersionBibliography } from "#src/db/schema.js";
import { parseBibliography } from "#src/lib/bibliography/parse-bibliography.js";
import { isMystContent } from "#src/lib/importers/document-formats.js";
import { mystBuildWarnings } from "#src/lib/myst/build-warnings.js";
import { extractAndStoreVersionReferences } from "#src/lib/references.js";
import { isLockConflictError } from "#src/lib/utils/db-errors.js";
import { type AuthEnv } from "#src/types/hono.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
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
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { ifMatchSatisfied, loadDraftEtag } from "./helpers/draft-etag.js";
import { draftIssues } from "./helpers/draft-issues.js";
import { draftLinks } from "./helpers/draft-links.js";
import { getOrCreateDraft } from "./helpers/get-or-create-draft.js";
import { getReadiness } from "./helpers/get-readiness.js";
import { PutDraftBibliographyBodySchema } from "./route-requests/put-draft-bibliography.js";
import { CreatePublicationResponseSchema } from "./route-responses/create-draft.js";

// Typed with AuthEnv, since it runs after requireAuth; a plain
// MiddlewareHandler would widen the handler's `c.var.user` back to nullable.
const limitBibliographySize = createMiddleware<AuthEnv>((c, next) => {
  const maxBytes = getConfig().BIBLIOGRAPHY_MAX_BYTES;
  return bodyLimit({
    maxSize: maxBytes,
    onError: (c) =>
      c.json(
        applicationError({
          files: {
            message: `The bibliography is larger than the ${maxBytes} byte limit`,
          },
        }),
        413
      ),
  })(c, next);
});

const ResponseHeadersSchema = z.object({
  ETag: z.string().openapi({
    description: "The draft's new ETag, for `If-Match` on the next write.",
  }),
});

export const putDraftBibliographyRoute = createAuthedRoute({
  method: "put",
  path: "/id/{id}/draft/bibliography",
  tags: ["publications"],
  summary: "Replace the draft's bibliography",
  description:
    "Replaces the BibTeX files the draft's citations are resolved against, " +
    "creating the draft if none is open. The list replaces the draft's " +
    "whole bibliography; an empty one removes it. A file that doesn't " +
    "parse, a key defined more than once, and a citation of a MyST " +
    "draft that the new files don't resolve are reported in " +
    "`validationErrors` as warnings: the files are stored as sent either " +
    "way, and a key defined twice keeps its last definition. The " +
    "bibliography is part of the draft's ETag, so `If-Match` guards it as " +
    "it guards the content; without it, the bibliography is replaced " +
    "unconditionally.",
  middleware: [limitBibliographySize],
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
    headers: z.object({
      "if-match": z.string().optional().openapi({
        description: "The draft's ETag from the last read or write.",
      }),
    }),
    body: {
      required: true,
      content: {
        "application/json": { schema: PutDraftBibliographyBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "The bibliography was replaced.",
      headers: ResponseHeadersSchema,
      content: {
        "application/json": { schema: CreatePublicationResponseSchema },
      },
    },
    201: {
      description: "A new draft was created to hold the bibliography.",
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
        "The draft comes from a Google Doc, which carries its references in " +
        "its own body. Or a push or a publish of this publication held it " +
        "for too long, or would have deadlocked with this write.",
      content: errorContent("draft"),
    },
    412: {
      description:
        "`If-Match` doesn't match the draft's ETag: it was changed since. " +
        "`GET .../id/{id}/draft/bibliography` returns the stored files.",
      content: errorContent("draft"),
    },
    413: {
      description:
        "The files are larger together than the server's limit " +
        "(`BIBLIOGRAPHY_MAX_BYTES`, 5 MiB by default).",
      content: errorContent("files"),
    },
  },
});

export async function putDraftBibliographyHandler(
  c: HandlerContext<typeof putDraftBibliographyRoute>
): HandlerReturnType<typeof putDraftBibliographyRoute> {
  const user = c.var.user;
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

  const { files } = c.req.valid("json");
  // Stored as sent, so the files come back byte for byte; an empty list is
  // stored as no bibliography, which hashes into the ETag the same way.
  const bibliography: VersionBibliography | null = files.length
    ? { files }
    : null;
  const warnings = parseBibliography(bibliography).issues;
  const ifMatch = c.req.valid("header")["if-match"];

  let written;
  try {
    written = await repos.transaction(async (txRepos) => {
      // Locked before anything is read, as a content push does, so writes to
      // a publication run one after another and this one sees every push and
      // publish that committed while it waited.
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
                  "The draft comes from a Google Doc and can't have a " +
                  "bibliography of its own",
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

      await txRepos.versions.update(draft.id, { bibliography });

      const readiness = await getReadiness(txRepos, id, draft.id);
      const updated = await txRepos.versions.findById(draft.id);
      return {
        draft,
        created: draftResult.status === "created",
        etag: await loadDraftEtag(txRepos, latest, updated!),
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
  if (written.error) return written.error;
  const { draft, created, etag, readiness } = written;

  // After the commit, as a content push does: which entries are cited, and so
  // which are references, can change with the bibliography alone.
  await extractAndStoreVersionReferences(draft.idInt, {
    format: draft.importDocumentFormat,
    abstract: draft.abstract,
    body: draft.body,
    bibliography,
    frontmatter: draft.frontmatter,
  }).catch((e) =>
    c.var.logger.error({ err: e }, "Failed to extract and store references")
  );
  // Which citations resolve can change with the bibliography alone, so the
  // draft's AST is checked as a content push checks it. A draft that isn't
  // MyST yet (a web-editor draft whose first push sends this first) has none.
  if (isMystContent(draft.importDocumentFormat)) {
    warnings.push(
      ...mystBuildWarnings({
        abstract: draft.abstract,
        body: draft.body,
        bibliography,
        frontmatter: draft.frontmatter,
      })
    );
  }

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
