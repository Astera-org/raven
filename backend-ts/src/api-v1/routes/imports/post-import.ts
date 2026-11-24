import { createPublicationFromImport } from "#src/lib/importers/create-publication-from-import.js";
import { replaceDraftFromImport } from "#src/lib/importers/replace-draft-from-import.js";
import { runGoogleDocImport } from "#src/lib/importers/run-google-doc-import.js";
import { ValidationIssuesResponse } from "#src/lib/middleware/validation-errors.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { canCreatePublication } from "#v1/routes/publications/helpers/can-create-publication.js";
import { getReadiness } from "#v1/routes/publications/helpers/get-readiness.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { ImporterError } from "@raven/core-import-format";
import { isGoogleDocUrl } from "@raven/importer-google-docs-markdown";
import { detectImportFormat } from "./helpers.js";
import { PostImportBodySchema } from "./route-requests/post-imports-request-schema.js";
import { PostImportResponseSchema } from "./route-responses/post-imports-response-schema.js";

export const postImportRoute = createAuthedRoute({
  method: "post",
  path: "/",
  stability: "stable",
  tags: ["imports"],
  summary: "Import a publication",
  description:
    "Converts the document at `source` and creates a draft publication from " +
    "the result, owned by the caller. `format` defaults to `auto`, which " +
    "picks the format from the source. Only Google Docs URLs are supported so " +
    'far. With `target: { type: "draft", publicationId }` the document is ' +
    "re-imported into that publication's draft instead (see " +
    "`DraftImportTarget`). Media in the document is copied to Raven in the " +
    "background; follow its progress with `GET /imports/{importId}`.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PostImportBodySchema } },
    },
  },
  responses: {
    201: {
      description:
        "The draft publication was created, or the target draft was " +
        "re-imported.",
      content: { "application/json": { schema: PostImportResponseSchema } },
    },
    400: {
      description: "The source isn't a supported document.",
      content: errorContent("source"),
    },
    403: {
      description:
        "The caller can't create publications (or edit the target " +
        "publication), or the source document isn't accessible to Raven " +
        "(e.g. a private document).",
      content: errorContent("auth", "source"),
    },
    404: {
      description:
        "The source document doesn't exist, or the target publication or " +
        "its draft doesn't (including a draft published or deleted while " +
        "the document was being converted).",
      content: errorContent("source", "publication", "draft"),
    },
    409: {
      description:
        "The target draft's media from an earlier import is still being " +
        "copied to Raven. Retry once `GET /imports/{importId}` for that " +
        "import reports `settled`.",
      content: errorContent("draft"),
    },
    ...ValidationIssuesResponse,
    502: {
      description:
        "The source couldn't be fetched or read, e.g. its server returned an " +
        "error or rate-limited Raven. Retrying later may work.",
      content: errorContent("source"),
    },
  },
});

type PostImportRoute = typeof postImportRoute;

export async function postImportHandler(
  c: HandlerContext<PostImportRoute>
): HandlerReturnType<PostImportRoute> {
  const user = c.var.user;
  const repos = new Repositories();
  const { source, format, target } = c.req.valid("json");

  // Checked before fetching the document, which can take a while.
  let draft: { publicationId: string; versionId: string; slug: string } | null =
    null;
  if (target.type === "draft") {
    const publication = await repos.publications.findById(target.publicationId);
    if (!publication) {
      return c.json(
        applicationError({
          publication: { message: "Publication not found" },
        }),
        404
      );
    }
    if (
      !(await repos.publications.canEdit(
        user.id,
        publication.id,
        publication.ownerId
      ))
    ) {
      return c.json(
        applicationError({ auth: { message: "Permission denied" } }),
        403
      );
    }
    const version = await repos.versions.findDraftForPublication(
      publication.id
    );
    if (!version) {
      return c.json(
        applicationError({
          draft: { message: "Could not find draft for publication" },
        }),
        404
      );
    }
    if (await repos.imports.hasUnsettledMediaImport(publication.id)) {
      return c.json(MEDIA_STILL_IMPORTING, 409);
    }
    draft = {
      publicationId: publication.id,
      versionId: version.id,
      slug: publication.slug,
    };
  } else if (!(await canCreatePublication(repos, user.id))) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const url = new URL(source.url);
  const resolvedFormat =
    format.type === "auto" ? detectImportFormat(url) : format.type;
  if (resolvedFormat !== "gdoc" || !isGoogleDocUrl(url)) {
    return c.json(
      applicationError({
        source: { message: "Only Google Docs URLs can be imported" },
      }),
      400
    );
  }

  let imported: Awaited<ReturnType<typeof runGoogleDocImport>>;
  try {
    imported = await runGoogleDocImport({
      url,
      signal: c.req.raw.signal,
      options:
        format.type === "gdoc"
          ? { singleLineBreaks: format.singleLineBreaks }
          : undefined,
    });
  } catch (e) {
    if (!(e instanceof ImporterError)) throw e;
    const details = e.details;
    switch (details.code) {
      case "unsupported":
        return c.json(
          applicationError({ source: { message: e.message } }),
          400
        );
      case "not_found":
        return c.json(
          applicationError({ source: { message: e.message } }),
          404
        );
      case "fetch-error":
      case "read-error":
        return c.json(
          applicationError({ source: { message: e.message } }),
          502
        );
      case "forbidden":
      case "needs_authorization":
        return c.json(
          applicationError({ source: { message: e.message } }),
          403
        );
      case "validation":
        return c.json(
          {
            type: "validation_error",
            errors: details.issues,
            error: "The document couldn't be imported, because it is invalid.",
          },
          422
        );
      case "conversion-failed":
        return c.json(
          {
            type: "validation_error",
            errors: [{ code: details.code, path: [], message: e.message }],
            error:
              "The document couldn't be imported, because it couldn't be converted.",
          },
          422
        );
    }
  }

  let result: Awaited<ReturnType<typeof createPublicationFromImport>>;
  if (draft) {
    // The draft may have changed while the doc was being converted.
    const replaced = await replaceDraftFromImport({ imported, ...draft });
    if (replaced.status === "not-a-draft") {
      return c.json(
        applicationError({
          draft: { message: "Could not find draft for publication" },
        }),
        404
      );
    }
    if (replaced.status === "media-importing") {
      return c.json(MEDIA_STILL_IMPORTING, 409);
    }
    const { importId, settled, issues } = replaced;
    result = { ...draft, importId, settled, issues };
  } else {
    result = await createPublicationFromImport({ imported, ownerId: user.id });
  }
  const { publicationId, versionId, importId, slug, settled, issues } = result;
  const readiness = await getReadiness(repos, publicationId, versionId);

  return c.json(
    {
      publicationId,
      versionId,
      importId,
      slug,
      settled,
      validationErrors: [...issues, ...(readiness.error?.issues ?? [])],
    },
    201
  );
}

const MEDIA_STILL_IMPORTING = applicationError({
  draft: {
    message:
      "Media from this draft's last import is still being copied. Try again " +
      "once it has finished.",
  },
});
