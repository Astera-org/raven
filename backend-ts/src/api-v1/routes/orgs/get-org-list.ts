import { getPagination } from "#src/lib/utils/get-pagination.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createV1Route } from "#v1/lib/create-v1-route.js";
import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { toOrgResponse } from "./helpers.js";
import { OrgListResponseSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// GET / — list organizations
// ---------------------------------------------------------------------------

export const getOrgListRoute = createV1Route({
  method: "get",
  path: "/",
  tags: ["orgs"],
  summary: "List organizations",
  request: { query: PaginationQueryRequestSchema },
  responses: {
    200: {
      description:
        "Active organizations, newest first. Site admins see every " +
        "organization; everyone else, including anonymous callers, sees " +
        "only listed ones (`unlisted` false).",
      content: {
        "application/json": {
          schema: OrgListResponseSchema,
        },
      },
    },
  },
});

export async function getOrgListHandler(
  c: HandlerContext<typeof getOrgListRoute>
): HandlerReturnType<typeof getOrgListRoute> {
  const repositories = makeRepositories();
  const { page, perPage, offset } = getPagination(c.req.valid("query"));

  const userId = c.get("user")?.id;
  const includeUnlisted =
    userId !== undefined &&
    (await repositories.users.findState(userId)) === "SITE_ADMIN";

  const [rows, total, totalListed] = await Promise.all([
    repositories.orgs.list({ includeUnlisted }, perPage, offset),
    repositories.orgs.count({ includeUnlisted }),
    // Only site admins see unlisted orgs, so only they need them counted.
    includeUnlisted
      ? repositories.orgs.count({ includeUnlisted: false })
      : null,
  ]);

  const items = rows.map((row) => {
    const { canEdit: _canEdit, ...item } = toOrgResponse(row, false);
    return item;
  });

  return c.json(
    {
      items,
      pagination: {
        total,
        page,
        perPage,
        totalUnlisted: totalListed === null ? 0 : total - totalListed,
      },
    },
    200
  );
}
