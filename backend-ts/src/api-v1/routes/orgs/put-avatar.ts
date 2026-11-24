import { getConfig } from "#src/config.js";
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
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { requireEditableOrg } from "./helpers.js";
import {
  AvatarResponseSchema,
  OrgIdOrSlugParamSchema,
  PutAvatarBodySchema,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// PUT /{idOrSlug}/avatar — replace the organization's avatar
// ---------------------------------------------------------------------------

const ALLOWED_AVATAR_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif"]);

export const putAvatarRoute = createAuthedRoute({
  method: "put",
  path: "/{idOrSlug}/avatar",
  tags: ["orgs"],
  summary: "Replace an organization's avatar",
  request: {
    params: OrgIdOrSlugParamSchema,
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: PutAvatarBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "The avatar was replaced.",
      content: { "application/json": { schema: AvatarResponseSchema } },
    },
    400: {
      description: "No avatar file was provided, or its type is unsupported.",
      content: errorContent("avatar"),
    },
    403: {
      description:
        "The authenticated user does not have edit permission on this organization.",
      content: errorContent("auth"),
    },
    404: {
      description: "No organization exists for the given id or slug.",
      content: errorContent("org"),
    },
  },
});

export async function putAvatarHandler(
  c: HandlerContext<typeof putAvatarRoute>
): HandlerReturnType<typeof putAvatarRoute> {
  const repositories = makeRepositories();
  const userId = c.get("user").id;
  const { idOrSlug } = c.req.valid("param");
  const result = await requireEditableOrg(repositories.orgs, idOrSlug, userId);
  if (!result.ok) {
    return result.status === 404
      ? c.json(
          applicationError({ org: { message: "Organization not found" } }),
          404
        )
      : c.json(
          applicationError({ auth: { message: "Permission denied" } }),
          403
        );
  }

  const { avatar: file } = c.req.valid("form");
  if (!(file instanceof File)) {
    return c.json(
      applicationError({ avatar: { message: "No avatar file provided" } }),
      400
    );
  }

  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED_AVATAR_EXTENSIONS.has(ext)) {
    return c.json(
      applicationError({ avatar: { message: "Unsupported file type" } }),
      400
    );
  }

  const cfg = getConfig();
  const newFilename = `org_${result.orgId}_${Date.now()}${ext}`;
  const destDir = join(cfg.IMG_DIR, "avatars", "orgs");
  await mkdir(destDir, { recursive: true });
  await writeFile(
    join(destDir, newFilename),
    Buffer.from(await file.arrayBuffer())
  );

  const avatarRelPath = `avatars/orgs/${newFilename}`;
  await repositories.orgs.updateAvatar(result.orgId, avatarRelPath);
  return c.json({ avatarUrl: `/api/v1/files/${avatarRelPath}` }, 200);
}
