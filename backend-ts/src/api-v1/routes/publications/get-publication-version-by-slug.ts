import { getConfig } from "#src/config.js";
import { isMystContent } from "#src/lib/importers/document-formats.js";
import { type AppEnv } from "#src/types/hono.js";
import { Repositories } from "#v1/db-repositories/index.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { mediaType } from "@hapi/accept";
import { type RouteHandler, z } from "@hono/zod-openapi";
import { buildGetPublicationResponse } from "./helpers/build-get-publication-response.js";
import { negotiateMdast } from "./helpers/negotiate-mdast.js";
import { prepareMdastResponse } from "./helpers/prepare-mdast-response.js";
import {
  agentMarkdownCacheControl,
  publicationToAgentMarkdown,
} from "./helpers/publication-to-agent-markdown.js";
import { readableVersionNumber } from "./helpers/readable-version-number.js";
import {
  MDAST_ACCEPT_DESCRIPTION,
  mdastContent,
  mdastResponses,
} from "./route-responses/mdast.js";
import { GetPublicationResponseSchema } from "./route-responses/publication.js";

/** What a version serves besides the AST. */
const VERSION_TYPES = [
  "application/json",
  "application/*",
  "text/markdown",
  "text/*",
  "*/*",
];

export const getPublicationVersionBySlugRoute = createV1Route({
  method: "get",
  tags: ["publications"],
  summary: "Get a publication version by slug",
  path: "/p/{slug}/versions/{versionNumber}",
  stability: "stable",
  description:
    "Returns the given version of a publication, identified by slug, if " +
    "the caller has access to it (published versions are public; " +
    "draft versions require view/edit permission). A deleted " +
    "publication that once had a DOI-bearing version always returns " +
    "that last published version instead, regardless of the version " +
    "requested, so the DOI keeps resolving. Responds with JSON by " +
    "default; append `.md` or `.json` to `versionNumber` (e.g. `v3.md`) " +
    "or send `Accept: text/markdown` for a clean Markdown rendering " +
    "intended for AI agents/crawlers. An explicit suffix always wins " +
    "over the `Accept` header. " +
    MDAST_ACCEPT_DESCRIPTION +
    " A draft version's AST carries `messages` and is private.",
  request: {
    params: z.object({
      versionNumber: z
        .string()
        .regex(/^v\d+(\.(md|json))?$/)
        .openapi({
          param: { name: "versionNumber", in: "path" },
          description:
            "The version to fetch, as `v` followed by the version " +
            "number (e.g. `v3`), optionally suffixed with `.md` or " +
            "`.json` to force that response format.",
          example: "v3",
        }),
      slug: z.string().openapi({
        param: { name: "slug", in: "path" },
        description: "The publication's slug.",
        example: "how-cells-divide",
      }),
    }),
  },
  responses: {
    200: {
      description: "The requested version of the publication.",
      content: {
        "application/json": {
          schema: GetPublicationResponseSchema,
        },
        "text/markdown": { schema: z.string() },
        ...mdastContent,
      },
    },
    304: mdastResponses[304],
    403: {
      description:
        "The requested version is a draft and the caller does not " +
        "have permission to view it.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication or version exists for the given identifiers.",
      content: errorContent("publication", "version"),
    },
    406: {
      description:
        "`Accept` asks for the MyST AST of a version that is not MyST, " +
        "with an unsupported `schema` or a malformed parameter, or while " +
        "the AST is switched off.",
      content: errorContent(),
    },
    422: mdastResponses[422],
  },
});

export const getPublicationVersionBySlugHandler: RouteHandler<
  typeof getPublicationVersionBySlugRoute,
  AppEnv
> = async (c) => {
  const user = c.var.user;
  const repos = new Repositories();

  const { slug, versionNumber: versionNumberStr } = c.req.valid("param");
  const publication = await repos.publications.findBySlug(slug);

  const [number, ext] = versionNumberStr.split(".");
  const versionNumber = parseInt(number?.replace("v", "") ?? "-1", 10);

  if (!publication) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  const readableNumber = readableVersionNumber(publication, versionNumber);
  if (readableNumber == null) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  const version = await repos.versions.findByVersionNumberOfPublication(
    publication.id,
    readableNumber
  );

  if (!version) {
    return c.json(
      applicationError({ version: { message: "Version not found" } }),
      404
    );
  }

  if (
    (publication.state === "DRAFT" || version.state === "DRAFT") &&
    !(await repos.publications.canViewDraft(
      user?.id ?? null,
      publication.id,
      publication.ownerId
    ))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const mdast = ext
    ? ({ format: "none" } as const)
    : negotiateMdast(c.req.header("Accept"), {
        enabled: getConfig().MYST_MDAST_ENABLED,
        servesOtherwise: (preference) => VERSION_TYPES.includes(preference),
      });
  if (mdast.format === "not-acceptable") {
    return c.json(applicationError({ root: { message: mdast.reason } }), 406);
  }
  if (mdast.format === "mdast") {
    if (!isMystContent(version.importDocumentFormat)) {
      return c.json(
        applicationError({ root: { message: "The version is not MyST" } }),
        406
      );
    }
    const response = await prepareMdastResponse({
      content: version,
      isDraft: version.state === "DRAFT",
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

  const publicationToReturn = await buildGetPublicationResponse(
    publication,
    version
  );

  const varyHeader: object | { Vary: string } = !ext ? { Vary: "Accept" } : {};

  if (
    mediaType(c.req.header("Accept"), ["application/json", "text/markdown"]) ===
      "text/markdown" ||
    ext === "md"
  ) {
    return c.text(await publicationToAgentMarkdown(publicationToReturn), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": agentMarkdownCacheControl(publicationToReturn),
      ...varyHeader,
    });
  }

  return c.json({ publication: publicationToReturn }, 200);
};
