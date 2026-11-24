import { Repositories } from "#v1/db-repositories/index.js";
import { ARCADIA_SCIENCE_NAME } from "#v1/lib/constants.js";
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
import { DoiEligibilityResponseSchema } from "./route-responses/doi.js";

export const getDoiEligibilityRoute = createAuthedRoute({
  method: "get",
  path: "/id/{id}/doi/eligibility",
  stability: "stable",
  tags: ["publications"],
  summary: "Get DOI minting eligibility",
  description: "Checks whether a pub can have a DOI minted or self-minted.",
  request: {
    params: z.object({ id: ulidSchema({ fieldName: "id" }) }),
  },
  responses: {
    200: {
      description: "Response of DOI eligibility.",
      content: {
        "application/json": {
          schema: DoiEligibilityResponseSchema,
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

export async function getDoiEligibilityHandler(
  c: HandlerContext<typeof getDoiEligibilityRoute>
): HandlerReturnType<typeof getDoiEligibilityRoute> {
  const user = c.var.user;
  const id = c.req.valid("param").id;
  const repos = new Repositories();
  const publicationRow = await repos.publications.findById(id);

  if (!publicationRow) {
    return c.json(
      applicationError({ publication: { message: "Publication not found" } }),
      404
    );
  }

  if (
    !(await repos.publications.canEdit(
      user.id,
      publicationRow.id,
      publicationRow.ownerId
    ))
  ) {
    return c.json(
      applicationError({ auth: { message: "Permission denied" } }),
      403
    );
  }

  const potentialOrgs = await repos.orgs.listPotentialOrgsForPublication(
    publicationRow.id,
    publicationRow.ownerId
  );

  const mintingEnabled = potentialOrgs.some((o) => o.doiMintingEnabled);
  const selfMintingEnabled = potentialOrgs.some(
    (o) => o.name === ARCADIA_SCIENCE_NAME
  );

  return c.json(
    {
      minting: mintingEnabled,
      ...(selfMintingEnabled ? { selfMinting: selfMintingEnabled } : {}),
    },
    200
  );
}
