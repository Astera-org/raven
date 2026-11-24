import type { AppEnv } from "#src/types/hono.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import { createOrgHandler, createOrgRoute } from "./create-org.js";
import { deleteOrgHandler, deleteOrgRoute } from "./delete-org.js";
import { getOrgListHandler, getOrgListRoute } from "./get-org-list.js";
import { getOrgHandler, getOrgRoute } from "./get-org.js";
import { listMembersHandler, listMembersRoute } from "./list-members.js";
import {
  listOrgPublicationsHandler,
  listOrgPublicationsRoute,
} from "./list-publications.js";
import { patchOrgHandler, patchOrgRoute } from "./patch-org.js";
import { putAvatarHandler, putAvatarRoute } from "./put-avatar.js";

const app = new OpenAPIHono<AppEnv>();

const orgsRouter = app
  // GET     /
  .openapi(getOrgListRoute, getOrgListHandler)
  // POST    /
  .openapi(createOrgRoute, createOrgHandler)
  // GET     /{idOrSlug}
  .openapi(getOrgRoute, getOrgHandler)
  // PATCH   /{idOrSlug}
  .openapi(patchOrgRoute, patchOrgHandler)
  // DELETE  /{idOrSlug}
  .openapi(deleteOrgRoute, deleteOrgHandler)
  // PUT     /{idOrSlug}/avatar
  .openapi(putAvatarRoute, putAvatarHandler)
  // GET     /{idOrSlug}/members
  .openapi(listMembersRoute, listMembersHandler)
  // GET     /{idOrSlug}/publications
  .openapi(listOrgPublicationsRoute, listOrgPublicationsHandler);

export default orgsRouter;
