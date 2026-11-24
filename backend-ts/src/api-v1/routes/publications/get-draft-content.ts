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
import { MYSTMD_FORMAT } from "@raven/importer-mystmd";
import { loadDraftEtag } from "./helpers/draft-etag.js";
import { mystSourceEtag } from "./helpers/myst-source-etag.js";
import { MYST_MEDIA_TYPE } from "./helpers/negotiate-draft-format.js";

export const getDraftContentRoute = createAuthedRoute({
  method: "get",
  path: "/id/{id}/draft/content",
  tags: ["publications"],
  summary: "Get the draft's MyST content",
  description:
    "Returns the MyST document last stored by a MyST create or " +
    "`PUT .../id/{id}/draft/content`, exactly as sent. It's only served " +
    "while it still describes the draft; once the draft is edited another " +
    "way (web editor, `PATCH`), this is a 409. The server never rebuilds " +
    "the source from the draft's fields.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    200: {
      description: "The stored MyST source.",
      headers: z.object({
        ETag: z.string().openapi({
          description: "The draft's ETag, for `If-Match` on the next `PUT`.",
        }),
      }),
      content: {
        [MYST_MEDIA_TYPE]: {
          schema: z.string().openapi({ description: "A MyST document." }),
        },
      },
    },
    403: {
      description:
        "The authenticated user does not have view permission on this " +
        "publication's draft.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication exists for the given ID, it has no draft, or the " +
        "draft has no MyST source (web-editor or Google Doc publications).",
      content: errorContent("publication", "draft"),
    },
    409: {
      description:
        "The draft was edited without MyST since its source was stored, so " +
        "the source no longer describes it. `GET .../id/{id}/draft` returns " +
        "its current fields.",
      content: errorContent("draft"),
    },
  },
});

export async function getDraftContentHandler(
  c: HandlerContext<typeof getDraftContentRoute>
): HandlerReturnType<typeof getDraftContentRoute> {
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
  if (
    !(await repos.publications.canViewDraft(user.id, id, publication.ownerId))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const draft = await repos.versions.findDraftForPublication(id);
  if (!draft) {
    return c.json(
      applicationError({ draft: { message: "No draft found" } }),
      404
    );
  }
  const source = draft.importDocumentBody;
  if (draft.importDocumentFormat !== MYSTMD_FORMAT || source == null) {
    return c.json(
      applicationError({ draft: { message: "The draft has no MyST source" } }),
      404
    );
  }

  const etag = await loadDraftEtag(repos, publication, draft);
  if (mystSourceEtag(source, publication, draft.bibliography) !== etag) {
    return c.json(
      applicationError({
        draft: {
          message:
            "The draft was edited since its MyST source was stored; get its " +
            `current fields from /api/v1/publications/id/${id}/draft`,
        },
      }),
      409
    );
  }

  return c.body(source, 200, {
    "Content-Type": `${MYST_MEDIA_TYPE}; charset=utf-8`,
    ETag: etag,
  });
}
