import { isDuplicateEntryError } from "#src/lib/utils/db-errors.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import {
  type AdminEnv,
  isOrgInAdminScope,
} from "#v1/routes/admin/middleware/require-admin-scope.js";
import { toUtcIso } from "#v1/routes/orgs/helpers.js";
import { OrgIdOrSlugParamSchema } from "#v1/routes/orgs/schemas.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import { AdminAddOrgMemberBodySchema } from "./route-requests/post-member.js";
import { AdminAddOrgMemberResponseSchema } from "./route-responses/orgs.js";

// ---------------------------------------------------------------------------
// POST /orgs/{idOrSlug}/members — add a member
// ---------------------------------------------------------------------------

export const postAdminOrgMemberRoute = createAdminRoute({
  method: "post",
  path: "/orgs/{idOrSlug}/members",
  tags: ["orgs"],
  summary: "Add a member to an organization",
  request: {
    params: OrgIdOrSlugParamSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: AdminAddOrgMemberBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "The member was added.",
      content: {
        "application/json": { schema: AdminAddOrgMemberResponseSchema },
      },
    },
    403: {
      description: "The caller does not administer this organization.",
      content: errorContent("auth"),
    },
    404: {
      description:
        "No organization exists for the given id or slug, or no user exists for the given username.",
      content: errorContent("org", "username"),
    },
    409: {
      description: "The user is already a member of this organization.",
      content: errorContent("username"),
    },
  },
});

export async function postAdminOrgMemberHandler(
  c: HandlerContext<typeof postAdminOrgMemberRoute, AdminEnv>
): HandlerReturnType<typeof postAdminOrgMemberRoute> {
  const repositories = makeRepositories();
  const { idOrSlug } = c.req.valid("param");
  const org = await repositories.orgs.findOrgByIdentifier(idOrSlug);
  if (!org) {
    return c.json(
      applicationError({ org: { message: "Organization not found" } }),
      404
    );
  }
  const orgId = org.id;

  if (!isOrgInAdminScope(c.var.adminScope, orgId)) {
    return c.json(
      applicationError({ auth: { message: "Not authorized to access org" } }),
      403
    );
  }

  const { username, startAt, isAdmin, endAt } = c.req.valid("json");
  const member = await repositories.users.findByUsername(username);
  if (!member) {
    return c.json(
      applicationError({ username: { message: "User not found" } }),
      404
    );
  }
  const memberId = member.id;

  const alreadyMember = applicationError({
    username: { message: "User is already a member of this organization" },
  });
  if (await repositories.orgs.existsMembership(orgId, memberId)) {
    return c.json(alreadyMember, 409);
  }

  try {
    await repositories.orgs.createMember({
      orgId,
      userId: memberId,
      isAdmin: Boolean(isAdmin),
      startAt: startAt ?? null,
      endAt: endAt ?? null,
    });
  } catch (error) {
    // A concurrent request can add the same member between the check above
    // and this insert.
    if (isDuplicateEntryError(error)) return c.json(alreadyMember, 409);
    throw error;
  }

  return c.json(
    {
      userId: memberId,
      username,
      isAdmin: Boolean(isAdmin),
      startAt: toUtcIso(startAt),
      endAt: toUtcIso(endAt),
    },
    201
  );
}
