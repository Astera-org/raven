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
import { publishDraft } from "./helpers/publish-draft.js";
import { PostVersionBodySchema } from "./route-requests/post-version.js";
import { PublishedVersionResponseSchema } from "./route-responses/published-version.js";

export const postVersionRoute = createAuthedRoute({
  method: "post",
  path: "/id/{id}/versions",
  tags: ["publications"],
  summary: "Publish a publication's draft as a new version",
  description:
    "Promotes the publication's current draft version to PUBLISHED, " +
    "minting/updating DataCite DOIs when the publication's org(s) have " +
    "that enabled. Replaces v0's slug-addressed `POST /:slug/publish` and " +
    "the deprecated `POST .../id/{id}/publish`.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
    body: {
      required: false,
      content: { "application/json": { schema: PostVersionBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The draft was published as a new version.",
      headers: z.object({
        Location: z.string().openapi({
          description: "The new version, `.../id/{id}/versions/v{n}`.",
        }),
      }),
      content: {
        "application/json": { schema: PublishedVersionResponseSchema },
      },
    },
    400: {
      description:
        "The draft's `body` field could not be persisted, e.g. embedded " +
        "media in the body failed to upload.",
      content: errorContent("mediaAssets"),
    },
    403: {
      description:
        "The authenticated user may not publish this publication: only " +
        "its owner (when it has no org, or they are a member of one of " +
        "its orgs) or an ADMIN of one of its orgs can.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No publication exists for the given ID, or it has no draft.",
      content: errorContent("publication", "draft"),
    },
  },
});

export async function postVersionHandler(
  c: HandlerContext<typeof postVersionRoute>
): HandlerReturnType<typeof postVersionRoute> {
  const user = c.var.user;
  const result = await publishDraft({
    id: c.req.valid("param").id,
    userId: user.id,
    note: c.req.valid("json")?.note,
    requestLogger: c.var.logger,
  });
  if (result.status === "invalid") {
    return c.var.validationErrors(result.issues);
  }
  if (result.status === "error") {
    if (result.code === 400)
      return c.json(applicationError(result.errors), 400);
    if (result.code === 403)
      return c.json(applicationError(result.errors), 403);
    return c.json(applicationError(result.errors), 404);
  }

  const { publicationId, versionNumber } = result.published;
  return c.json(result.published, 201, {
    Location: `/api/v1/publications/id/${publicationId}/versions/v${versionNumber}`,
  });
}
