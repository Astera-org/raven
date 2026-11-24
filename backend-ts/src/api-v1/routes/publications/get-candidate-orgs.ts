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
import { CandidateOrgListResponseSchema } from "./route-responses/candidate-orgs.js";

export const getCandidateOrgsRoute = createAuthedRoute({
  method: "get",
  path: "/id/{id}/candidate-orgs",
  stability: "stable",
  tags: ["publications"],
  summary: "Get orgs a publication could be associated with",
  description:
    "Orgs the publication's owner or any of its contributors actively " +
    "belongs to — candidates for `PATCH .../id/{id}/draft`'s `orgs` field. " +
    "Replaces v0's `GET /publications/potential_orgs`.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    200: {
      description: "Candidate orgs.",
      content: {
        "application/json": {
          schema: CandidateOrgListResponseSchema,
        },
      },
    },
    403: {
      description:
        "The authenticated user does not have edit permission on this " +
        "publication.",
      content: errorContent("auth"),
    },
    404: {
      description: "No publication exists for the given ID.",
      content: errorContent("publication"),
    },
  },
});

export async function getCandidateOrgsHandler(
  c: HandlerContext<typeof getCandidateOrgsRoute>
): HandlerReturnType<typeof getCandidateOrgsRoute> {
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

  const items = await repos.orgs.listPotentialOrgsForPublication(
    publication.id,
    publication.ownerId
  );

  return c.json(
    {
      items,
      pagination: { total: items.length, page: 1, perPage: items.length },
    },
    200
  );
}
