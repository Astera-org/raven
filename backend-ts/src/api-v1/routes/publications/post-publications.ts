import { ValidationIssuesResponse } from "#src/lib/middleware/validation-errors.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { z } from "@hono/zod-openapi";
import { MYSTMD_FORMAT } from "@raven/importer-mystmd";
import { canCreatePublication } from "./helpers/can-create-publication.js";
import { createPublication } from "./helpers/create-publication.js";
import { postPublicationsMystHandler } from "./post-publications-myst.js";
import { CreatePublicationBodySchema } from "./route-requests/post-publications.js";
import { CreatePublicationResponseSchema } from "./route-responses/create-draft.js";

export const postPublicationsRoute = createAuthedRoute({
  method: "post",
  path: "/",
  tags: ["publications"],
  summary: "Create a publication draft",
  description:
    "Creates a new publication and its first (draft) version. DOI minting " +
    "is deferred: it depends on the org the publication is attached to, " +
    "which isn't known yet at creation time — see `PATCH .../id/{id}/draft` " +
    "(`orgs`) and `POST .../id/{id}/doi`.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreatePublicationBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The publication and its first draft version were created.",
      headers: z.object({
        Location: z.string().openapi({
          description: "The new publication, `.../id/{id}`.",
        }),
        ETag: z.string().openapi({
          description: "The draft's ETag, for `If-Match` on later writes.",
        }),
      }),
      content: {
        "application/json": {
          schema: CreatePublicationResponseSchema,
        },
      },
    },
    400: {
      description:
        "The publication `body` field could not be persisted, e.g. " +
        "embedded media in the body failed to upload.",
      content: errorContent("mediaAssets"),
    },
    403: {
      description:
        "The authenticated user is not permitted to create publications.",
      content: errorContent("auth"),
    },
    415: {
      description: "The body isn't `application/json`.",
      content: errorContent(),
    },
    422: {
      ...ValidationIssuesResponse[422],
      description:
        "The request body failed validation, the slug is already taken, " +
        "or the `doi` is already in use by another publication.",
    },
  },
});

export async function postPublicationsHandler(
  c: HandlerContext<typeof postPublicationsRoute>
): HandlerReturnType<typeof postPublicationsRoute> {
  const body = c.req.valid("json");
  if (body.importDocument?.format === MYSTMD_FORMAT) {
    return postPublicationsMystHandler(c);
  }

  const user = c.var.user;
  if (!(await canCreatePublication(makeRepositories(), user.id))) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const result = await createPublication(body, { ownerId: user.id });
  if (result.status === "invalid") {
    return c.var.validationErrors(result.issues);
  }
  if (result.status === "error") {
    return c.json(
      applicationError({ mediaAssets: { message: result.error } }),
      result.code
    );
  }
  return c.json(result.created, 201, {
    Location: `/api/v1/publications/id/${result.created.publicationId}`,
    ETag: result.etag,
  });
}
