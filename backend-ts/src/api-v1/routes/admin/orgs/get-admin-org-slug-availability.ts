import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { GetAdminOrgSlugAvailabilityQuerySchema } from "./route-requests/get-admin-org-slug-availability.js";
import { AdminOrgSlugAvailabilityResponseSchema } from "./route-responses/org-slug-availability.js";

// ---------------------------------------------------------------------------
// GET /org-slug-availability — whether an organization slug is free
// ---------------------------------------------------------------------------

// Not under /orgs: any literal child of /orgs is also a valid org slug, so it
// would shadow `GET /orgs/{idOrSlug}` for the org that holds that slug.
export const getAdminOrgSlugAvailabilityRoute = createAdminRoute({
  method: "get",
  path: "/org-slug-availability",
  tags: ["orgs"],
  summary: "Check whether an organization slug is available",
  description:
    "Checks the slug against every organization, deleted and moderated " +
    "ones included, the same way creating or renaming an organization does.",
  request: { query: GetAdminOrgSlugAvailabilityQuerySchema },
  responses: {
    200: {
      description: "Whether the slug is available.",
      content: {
        "application/json": { schema: AdminOrgSlugAvailabilityResponseSchema },
      },
    },
  },
});

export async function getAdminOrgSlugAvailabilityHandler(
  c: HandlerContext<typeof getAdminOrgSlugAvailabilityRoute, AdminEnv>
): HandlerReturnType<typeof getAdminOrgSlugAvailabilityRoute> {
  const { slug } = c.req.valid("query");
  const taken = await makeRepositories().orgs.existsSlug(slug);
  return c.json({ available: !taken }, 200);
}
