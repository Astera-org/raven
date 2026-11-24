import { type AuthEnv } from "#src/types/hono.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import { applicationError } from "#v1/lib/route-responses/error-content.js";
import { type RouteHandler } from "@hono/zod-openapi";
import { publishDraft } from "./helpers/publish-draft.js";
import { postVersionRoute } from "./post-version.js";

const { 201: published, ...errorResponses } = postVersionRoute.responses;

export const postPublishRoute = createV1Route({
  ...postVersionRoute,
  path: "/id/{id}/publish",
  stability: "stable",
  summary: "Publish a publication's draft",
  description:
    "Deprecated: use `POST .../id/{id}/versions`, which does the same but " +
    "responds `201` with a `Location` header.",
  deprecated: true,
  responses: {
    200: {
      description: "The draft was published.",
      content: published.content,
    },
    ...errorResponses,
  },
});

export const postPublishHandler: RouteHandler<
  typeof postPublishRoute,
  AuthEnv
> = async (c) => {
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
  return c.json(result.published, 200);
};
