import { type AuthEnv } from "#src/types/hono.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import { type RouteHandler } from "@hono/zod-openapi";
import { patchDraftHandler, patchDraftRoute } from "./patch-draft.js";

export const patchPublicationRoute = createV1Route({
  ...patchDraftRoute,
  path: "/id/{id}",
  stability: "stable",
  summary: "Patch a publication draft",
  description:
    "Deprecated: use `PATCH .../id/{id}/draft`, which behaves identically. " +
    "This path names the publication, but the update applies to its draft.",
  deprecated: true,
});

export const patchPublicationHandler: RouteHandler<
  typeof patchPublicationRoute,
  AuthEnv
> = (c) => patchDraftHandler(c);
