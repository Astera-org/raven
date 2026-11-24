import { dbDateToIso8601 } from "#src/lib/dates.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { type OwnedPublicationListItemRow } from "#v1/db-repositories/publications-repository.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import { type PaginatedResponseV1 } from "#v1/lib/route-responses/pagination.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { GetMyPublicationListQuerySchema } from "./route-requests/get-my-publication-list.js";
import { MyPublicationListResponseSchema } from "./route-responses/my-publication-list.js";

export function toMyPublicationListResponse(
  result: PaginatedResponseV1<OwnedPublicationListItemRow>
) {
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      createdAt: dbDateToIso8601(item.createdAt),
      updatedAt: dbDateToIso8601(item.updatedAt),
    })),
  };
}

export const getMyPublicationListRoute = createAuthedRoute({
  method: "get",
  path: "/me/publications",
  tags: ["users"],
  summary: "List the caller's own publications",
  description:
    "Lists publications the caller owns, excluding deleted ones. Use " +
    "`state=draft` for the caller's drafts; replaces v0's " +
    "`GET /publications/my/drafts` and the deprecated " +
    "`GET /publications/drafts`.",
  request: { query: GetMyPublicationListQuerySchema },
  responses: {
    200: {
      description: "The caller's publications.",
      content: {
        "application/json": {
          schema: MyPublicationListResponseSchema,
        },
      },
    },
  },
});

export async function getMyPublicationListHandler(
  c: HandlerContext<typeof getMyPublicationListRoute>
): HandlerReturnType<typeof getMyPublicationListRoute> {
  const user = c.var.user;
  const { state, ...pagination } = c.req.valid("query");
  const result = await makeRepositories().publications.listForOwner(user.id, {
    state,
    pagination,
  });
  return c.json(toMyPublicationListResponse(result), 200);
}
