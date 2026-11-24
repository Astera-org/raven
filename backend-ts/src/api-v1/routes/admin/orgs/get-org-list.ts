import { getPagination } from "#src/lib/utils/get-pagination.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { type AdminOrgWithPubAndMemberCounts } from "#v1/db-repositories/orgs-repository.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { toAdminOrgResponse } from "./helpers/to-admin-org-response.js";
import {
  AdminGetOrgsListRequestSchema,
  type AdminOrgsListSortKey,
} from "./route-requests/get-orgs-list-request.js";
import { AdminOrgListResponseSchema } from "./route-responses/orgs.js";

// ---------------------------------------------------------------------------
// GET / — list organizations
// ---------------------------------------------------------------------------

export const getAdminOrgListRoute = createAdminRoute({
  method: "get",
  path: "/orgs",
  tags: ["orgs"],
  summary: "List organizations that one administers",
  request: { query: AdminGetOrgsListRequestSchema },
  responses: {
    200: {
      description:
        "Active organizations, ordered by `sort` (newest first when " +
        "omitted). Site admins see every organization; org admins see " +
        "only orgs that they admin.",
      content: {
        "application/json": {
          schema: AdminOrgListResponseSchema,
        },
      },
    },
  },
});

export async function getAdminOrgListHandler(
  c: HandlerContext<typeof getAdminOrgListRoute, AdminEnv>
): HandlerReturnType<typeof getAdminOrgListRoute> {
  const repositories = makeRepositories();
  const { page, perPage, offset } = getPagination(c.req.valid("query"));

  const adminScope = c.get("adminScope");
  const user = c.get("user");
  let rows: AdminOrgWithPubAndMemberCounts[];
  let total: number;
  let totalUnlisted: number;

  const { sort: sortQuery = "-created" } = c.req.valid("query");
  const sort = sortQuery.replace("-", "") as AdminOrgsListSortKey;
  const desc = sortQuery.startsWith("-");

  // Retrieve different orgs depending on who the user is
  if (adminScope.kind === "site") {
    let totalListed: number;
    [rows, total, totalListed] = await Promise.all([
      repositories.orgs.listWithAllValues(
        { includeUnlisted: true },
        perPage,
        offset,
        sort,
        desc
      ),
      repositories.orgs.count({ includeUnlisted: true }),
      repositories.orgs.count({ includeUnlisted: false }),
    ]);
    totalUnlisted = total - totalListed;
  } else {
    [rows, total, totalUnlisted] = await Promise.all([
      repositories.orgs.listAdmined(user.id, perPage, offset, sort, desc),
      repositories.orgs.countAdmined(user.id),
      repositories.orgs.countAdmined(user.id, { onlyUnlisted: true }),
    ]);
  }

  const items = rows.map((row) => {
    const { canEdit: _canEdit, ...item } = toAdminOrgResponse(row, {
      counts: {
        currentMemberCount: row.currentMemberCount,
        totalMemberCount: row.totalMemberCount,
        publishedPublicationCount: row.publishedPublicationCount,
        totalPublicationCount: row.totalPublicationCount,
      },
      canEditOrg: true,
    });
    return item;
  });

  return c.json(
    { items, pagination: { total, page, perPage, totalUnlisted } },
    200
  );
}
