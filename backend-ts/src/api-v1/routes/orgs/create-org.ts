import { isDuplicateEntryError } from "#src/lib/utils/db-errors.js";
import { emptyToNull } from "#src/lib/utils/string.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAuthedRoute } from "#v1/lib/create-authed-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { ulid } from "ulid";
import { toOrgResponse } from "./helpers.js";
import { CreateOrgBodySchema, OrgResponseSchema } from "./schemas.js";

// ---------------------------------------------------------------------------
// POST / — create an organization (site admins only)
// ---------------------------------------------------------------------------

export const createOrgRoute = createAuthedRoute({
  method: "post",
  path: "/",
  tags: ["orgs"],
  summary: "Create an organization",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateOrgBodySchema } },
    },
  },
  responses: {
    201: {
      description: "The organization was created.",
      content: { "application/json": { schema: OrgResponseSchema } },
    },
    403: {
      description: "The authenticated user is not a site admin.",
      content: errorContent("auth"),
    },
    409: {
      description: "An organization with this name already exists.",
      content: errorContent("name"),
    },
  },
});

export async function createOrgHandler(
  c: HandlerContext<typeof createOrgRoute>
): HandlerReturnType<typeof createOrgRoute> {
  const repositories = makeRepositories();
  const userId = c.get("user").id;
  const userState = await repositories.users.findState(userId);
  if (userState !== "SITE_ADMIN") {
    return c.json(
      applicationError({ auth: { message: "Site admin permission required" } }),
      403
    );
  }

  const { name, avatar, profile } = c.req.valid("json");
  const slug = await repositories.orgs.slugifyOrgName(name);

  const orgUlid = ulid();
  let org;
  try {
    // Optimistic attempt to create the org with the slug computed above...
    org = await repositories.transaction(async (repos) => {
      await repos.orgs.create({
        id: orgUlid,
        name,
        slug,
        avatar: emptyToNull(avatar ?? null),
        profile: emptyToNull(profile ?? null),
      });
      await repos.orgs.addOrgAdmin({ orgId: orgUlid, userId });

      // The org we just created is guaranteed to be findable by its own id.
      return (await repos.orgs.findOrgByIdentifier(orgUlid))!;
    });
  } catch (error) {
    // ... can fail if a concurrent request took the same slug first
    if (isDuplicateEntryError(error)) {
      return c.json(
        applicationError({
          name: { message: "An organization with this name already exists" },
        }),
        409
      );
    }
    throw error;
  }
  return c.json(toOrgResponse(org, true), 201);
}
