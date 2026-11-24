import { isDuplicateEntryError } from "#src/lib/utils/db-errors.js";
import { emptyToNull } from "#src/lib/utils/string.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { ulid } from "ulid";
import { toAdminOrgResponse } from "./helpers/to-admin-org-response.js";
import { PostAdminOrgBodySchema } from "./route-requests/post-admin-org.js";
import { AdminOrgResponseSchema } from "./route-responses/orgs.js";

// ---------------------------------------------------------------------------
// POST /orgs — create an organization (site admins only)
// ---------------------------------------------------------------------------

export const postAdminOrgRoute = createAdminRoute({
  method: "post",
  path: "/orgs",
  tags: ["orgs"],
  summary: "Create an organization",
  description:
    "Unlike `POST /orgs`, accepts the admin-only fields. `slug` defaults to " +
    "one derived from `name`; a taken slug gets a numeric suffix. The caller " +
    "becomes the org's first admin.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PostAdminOrgBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The organization was created.",
      content: { "application/json": { schema: AdminOrgResponseSchema } },
    },
    403: {
      description: "The authenticated user is not a site admin.",
      content: errorContent("auth"),
    },
    409: {
      description: "An organization with this slug already exists.",
      content: errorContent("slug"),
    },
  },
});

export async function postAdminOrgHandler(
  c: HandlerContext<typeof postAdminOrgRoute, AdminEnv>
): HandlerReturnType<typeof postAdminOrgRoute> {
  if (c.var.adminScope.kind !== "site") {
    return c.json(
      applicationError({ auth: { message: "Site admin permission required" } }),
      403
    );
  }

  const repositories = makeRepositories();
  const body = c.req.valid("json");
  const slug = body.slug
    ? await repositories.orgs.findNextUnusedSlug(body.slug)
    : await repositories.orgs.slugifyOrgName(body.name);

  const orgId = ulid();
  let org;
  try {
    org = await repositories.transaction(async (repos) => {
      await repos.orgs.create({
        id: orgId,
        name: body.name,
        slug,
        avatar: emptyToNull(body.avatar ?? null),
        profile: emptyToNull(body.profile ?? null),
        rorId: emptyToNull(body.rorId ?? null),
        doiPrefix: emptyToNull(body.doiPrefix ?? null),
        doiMintingEnabled: body.doiMintingEnabled ?? false,
        unlisted: body.unlisted ?? false,
      });
      await repos.orgs.addOrgAdmin({ orgId, userId: c.var.user.id });

      // The org we just created is guaranteed to be findable by its own id.
      return (await repos.orgs.findOrgByIdentifier(orgId))!;
    });
  } catch (error) {
    // A concurrent request can take the slug between the check and the insert.
    if (isDuplicateEntryError(error)) {
      return c.json(
        applicationError({
          slug: { message: "An organization with this slug already exists" },
        }),
        409
      );
    }
    throw error;
  }

  return c.json(
    toAdminOrgResponse(org, {
      canEditOrg: true,
      counts: {
        currentMemberCount: 1,
        totalMemberCount: 1,
        publishedPublicationCount: 0,
        totalPublicationCount: 0,
      },
    }),
    201
  );
}
