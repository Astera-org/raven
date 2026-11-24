import { normalizeCrockfordBase32 } from "#src/lib/utils/normalize-crockford-base-32.js";
import { type AppEnv } from "#src/types/hono.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { EXAMPLE_ULID } from "#v1/lib/constants.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { mediaType } from "@hapi/accept";
import { type RouteHandler, z } from "@hono/zod-openapi";
import { buildGetPublicationResponse } from "./helpers/build-get-publication-response.js";
import {
  agentMarkdownCacheControl,
  publicationToAgentMarkdown,
} from "./helpers/publication-to-agent-markdown.js";
import { readableVersionNumber } from "./helpers/readable-version-number.js";
import { GetPublicationResponseSchema } from "./route-responses/publication.js";

export const getPublicationByIdRoute = createV1Route({
  method: "get",
  path: "/id/{id}",
  tags: ["publications"],
  summary: "Get a publication by ID",
  description:
    "Returns the latest published version of a publication, identified " +
    "by id. A deleted publication that once had a DOI-bearing " +
    "version still resolves here, always to that last published " +
    "version, so the DOI keeps working. Responds with JSON by default; " +
    "append `.md` to `id` (e.g. `foo-bar.md`) or send `Accept: " +
    "text/markdown` for a clean Markdown rendering intended for AI " +
    "agents/crawlers. An explicit `.md`/`.json` suffix always wins over " +
    "the `Accept` header.",
  request: {
    params: z.object({
      id: z.string().openapi({
        param: { name: "id", in: "path" },
        description:
          "The publication's id, optionally suffixed with " +
          "`.md` or `.json` to force that response format.",
        example: EXAMPLE_ULID,
      }),
    }),
  },
  responses: {
    200: {
      description: "The publication's latest published version.",
      content: {
        "application/json": {
          schema: GetPublicationResponseSchema,
        },
        "text/markdown": { schema: z.string() },
      },
    },
    403: {
      description:
        "The publication's latest version is a draft and the " +
        "authenticated user does not have permission to view it.",
      content: errorContent("auth"),
    },
    404: {
      description: "No publication exists for the given id.",
      content: errorContent("publication", "version"),
    },
  },
});

export const getPublicationByIdHandler: RouteHandler<
  typeof getPublicationByIdRoute,
  AppEnv
> = async (c) => {
  const user = c.var.user;
  const repos = makeRepositories();

  const idWithExt = c.req.valid("param").id;

  const [id, ext] = idWithExt.split(".");

  const pubRow = await repos.publications.findById(
    normalizeCrockfordBase32(id!)
  );

  if (!pubRow) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  const publicationId = pubRow.id;
  const ownerId = pubRow.ownerId;

  const versionNumber = readableVersionNumber(
    pubRow,
    pubRow.latestVersionNumber
  );
  if (versionNumber == null) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }
  const versionRow = await repos.versions.findByVersionNumberOfPublication(
    pubRow.id,
    versionNumber
  );
  if (!versionRow) {
    return c.json(
      applicationError({ version: { message: "Version not found" } }),
      404
    );
  }

  if (
    (pubRow["state"] === "DRAFT" || versionRow.state === "DRAFT") &&
    !(await repos.publications.canViewDraft(
      user?.id ?? null,
      publicationId,
      ownerId
    ))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const publication = await buildGetPublicationResponse(pubRow, versionRow);

  // Only include the Vary header if the extension is not specified, to indicate
  // that the response may vary based on the Accept header.
  const varyHeader: object | { Vary: string } = !ext ? { Vary: "Accept" } : {};

  if (
    mediaType(c.req.header("Accept"), ["application/json", "text/markdown"]) ===
      "text/markdown" ||
    ext === "md"
  ) {
    return c.text(await publicationToAgentMarkdown(publication), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": agentMarkdownCacheControl(publication),
      ...varyHeader,
    });
  }

  return c.json({ publication }, 200, {
    ...varyHeader,
  });
};
