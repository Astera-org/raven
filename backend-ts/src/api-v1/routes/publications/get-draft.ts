import { getConfig } from "#src/config.js";
import { isMystContent } from "#src/lib/importers/document-formats.js";
import { serializeMyst } from "#src/lib/myst/serialize-myst.js";
import { licenseToSpdx } from "#src/lib/utils/licenses.js";
import { Repositories } from "#v1/db-repositories/index.js";
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
import { draftEtag } from "./helpers/draft-etag.js";
import { getPublicationResponseAndReadiness } from "./helpers/get-readiness.js";
import {
  isMystPreference,
  MYST_MEDIA_TYPE,
  negotiateDraftFormat,
} from "./helpers/negotiate-draft-format.js";
import { negotiateMdast } from "./helpers/negotiate-mdast.js";
import { prepareMdastResponse } from "./helpers/prepare-mdast-response.js";
import { GetDraftResponseSchema } from "./route-responses/draft.js";
import {
  MDAST_ACCEPT_DESCRIPTION,
  mdastContent,
  mdastResponses,
} from "./route-responses/mdast.js";

/**
 * What the draft serves besides the AST, with MyST; plain `text/markdown` is
 * refused.
 */
const DRAFT_TYPES = ["application/json", "application/*", "*/*"];

export const getDraftRoute = createAuthedRoute({
  method: "get",
  path: "/id/{id}/draft",
  stability: "stable",
  tags: ["publications"],
  summary: "Get a publication's draft",
  description:
    "Viewable by a contributor, a site admin, or (once the publication has " +
    "at least one org attached) any member of one of those orgs — broader " +
    "than the edit permission `PATCH .../id/{id}/draft` requires. With " +
    "`Accept: text/markdown; variant=myst`, the draft comes back as a MyST " +
    "document built from its current fields (`title`, `subtitle`, " +
    "`abstract`, `license` as an SPDX ID, `keywords` from the tags, `doi`, " +
    "then the body), which `PUT .../id/{id}/draft/content` accepts back " +
    "unchanged. JSON stays the default; plain `text/markdown` isn't offered. " +
    MDAST_ACCEPT_DESCRIPTION +
    " The draft's AST carries `messages` and is private.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    200: {
      description:
        "The draft. `validationErrors` reports publish-readiness even " +
        "though this is a read — it's the same non-blocking echo `PATCH " +
        ".../id/{id}/draft` returns.",
      headers: z.object({
        ETag: z.string().openapi({
          description:
            "The draft's ETag, for `If-Match` on " +
            "`PUT .../id/{id}/draft/content`.",
        }),
        Vary: z.string().openapi({
          description: "Includes `Accept`: the representation depends on it.",
        }),
      }),
      content: {
        "application/json": {
          schema: GetDraftResponseSchema,
        },
        [MYST_MEDIA_TYPE]: {
          schema: z.string().openapi({
            description: "The draft as a MyST document.",
          }),
        },
        ...mdastContent,
      },
    },
    304: mdastResponses[304],
    403: {
      description:
        "The authenticated user does not have view permission on this " +
        "publication's draft.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication exists for the given ID, or it has no draft.",
      content: errorContent("publication", "draft"),
    },
    406: {
      description:
        "`Accept` asks for plain `text/markdown`, which isn't offered (use " +
        "`text/markdown; variant=myst`); or for the MyST AST of a draft " +
        "that is not MyST, with an unsupported `schema` or a malformed " +
        "parameter, or while the AST is switched off.",
      content: errorContent(),
    },
    409: {
      description:
        "MyST was requested, but the draft comes from a Google Doc, whose " +
        "body isn't standard MyST.",
      content: errorContent("draft"),
    },
    422: mdastResponses[422],
  },
});

export async function getDraftHandler(
  c: HandlerContext<typeof getDraftRoute>
): HandlerReturnType<typeof getDraftRoute> {
  const user = c.var.user;
  const id = c.req.valid("param").id;
  const repos = new Repositories();
  const publication = await repos.publications.findById(id);
  if (!publication) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  const draft = await repos.versions.findDraftForPublication(publication.id);
  if (!draft) {
    return c.json(
      applicationError({ draft: { message: "No draft found" } }),
      404
    );
  }

  if (
    !(await repos.publications.canViewDraft(
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

  const mdast = negotiateMdast(c.req.header("Accept"), {
    enabled: getConfig().MYST_MDAST_ENABLED,
    servesOtherwise: (preference) =>
      DRAFT_TYPES.includes(preference) || isMystPreference(preference),
  });
  if (mdast.format === "not-acceptable") {
    return c.json(applicationError({ root: { message: mdast.reason } }), 406);
  }
  if (mdast.format === "mdast") {
    if (!isMystContent(draft.importDocumentFormat)) {
      return c.json(
        applicationError({ root: { message: "The draft is not MyST" } }),
        406
      );
    }
    const response = await prepareMdastResponse({
      content: draft,
      isDraft: true,
      schema: mdast.schema,
      version: mdast.version,
      ifNoneMatch: c.req.header("If-None-Match"),
    });
    if (response.status === 422) {
      return c.json(
        applicationError({ root: { message: response.error } }),
        422
      );
    }
    if (response.status === 304) return c.body(null, 304, response.headers);
    return c.body(response.body, 200, response.headers);
  }

  const tags = await repos.publications.listTags(publication.id);
  const etag = draftEtag({ ...draft, license: publication.license, tags });
  const format = negotiateDraftFormat(c.req.header("Accept"));
  if (format === "not-acceptable") {
    return c.json(
      applicationError({
        root: {
          message: `Plain text/markdown isn't offered; use ${MYST_MEDIA_TYPE}`,
        },
      }),
      406
    );
  }
  if (format === "myst") {
    if (draft.importDocumentFormat === "gdoc") {
      return c.json(
        applicationError({
          draft: {
            message: "The draft comes from a Google Doc and isn't MyST",
          },
        }),
        409
      );
    }
    const myst = serializeMyst({
      title: draft.title ?? undefined,
      subtitle: draft.subtitle ?? undefined,
      abstract: draft.abstract ?? undefined,
      license: licenseToSpdx(publication.license) ?? undefined,
      keywords: tags,
      doi: publication.doi ?? undefined,
      frontmatter: draft.frontmatter,
      body: draft.body ?? "",
    });
    return c.body(myst, 200, {
      "Content-Type": `${MYST_MEDIA_TYPE}; charset=utf-8`,
      ETag: etag,
      Vary: "Accept",
    });
  }

  const { publication: pub, readiness } =
    await getPublicationResponseAndReadiness(publication.id, draft.id);
  if (pub === undefined) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  return c.json(
    {
      publication: pub,
      validationErrors: readiness.success ? undefined : readiness.error.issues,
    },
    200,
    { ETag: etag, Vary: "Accept" }
  );
}
