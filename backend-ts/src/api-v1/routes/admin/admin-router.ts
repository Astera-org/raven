import { OpenAPIHono } from "@hono/zod-openapi";
import {
  getDoiAuditHandler,
  getDoiAuditRoute,
} from "./doi-audits/get-doi-audit.js";
import {
  getDoiComparisonHandler,
  getDoiComparisonRoute,
} from "./doi-audits/get-doi-comparison.js";
import {
  postDoiAuditHandler,
  postDoiAuditRoute,
} from "./doi-audits/post-doi-audit.js";
import {
  postDoiPushHandler,
  postDoiPushRoute,
} from "./doi-audits/post-doi-push.js";
import {
  type AdminEnv,
  requireAdminScope,
} from "./middleware/require-admin-scope.js";
import {
  deleteAdminOrgMemberHandler,
  deleteAdminOrgMemberRoute,
} from "./orgs/delete-admin-org-member.js";
import {
  getAdminListMembersHandler,
  getAdminListMembersRoute,
} from "./orgs/get-admin-list-members.js";
import {
  getAdminOrgSlugAvailabilityHandler,
  getAdminOrgSlugAvailabilityRoute,
} from "./orgs/get-admin-org-slug-availability.js";
import {
  getAdminOrgListHandler,
  getAdminOrgListRoute,
} from "./orgs/get-org-list.js";
import { getAdminOrgHandler, getAdminOrgRoute } from "./orgs/get-org.js";
import {
  getAdminOrgPublicationsHandler,
  getAdminOrgPublicationsRoute,
} from "./orgs/get-publications.js";
import {
  patchAdminOrgMemberHandler,
  patchAdminOrgMemberRoute,
} from "./orgs/patch-admin-org-member.js";
import {
  patchAdminOrgHandler,
  patchAdminOrgRoute,
} from "./orgs/patch-admin-org.js";
import {
  postAdminOrgMemberHandler,
  postAdminOrgMemberRoute,
} from "./orgs/post-admin-org-member.js";
import {
  postAdminOrgHandler,
  postAdminOrgRoute,
} from "./orgs/post-admin-org.js";
import {
  getAdminPublicationListHandler,
  getAdminPublicationListRoute,
} from "./publications/get-admin-publication-list.js";
import {
  getAdminPublicationVersionHandler,
  getAdminPublicationVersionRoute,
} from "./publications/get-admin-publication-version.js";
import {
  getAdminPublicationHandler,
  getAdminPublicationRoute,
} from "./publications/get-admin-publication.js";
import {
  patchAdminPublicationHandler,
  patchAdminPublicationRoute,
} from "./publications/patch-admin-publication.js";
import {
  getAdminUserCommentListHandler,
  getAdminUserCommentListRoute,
} from "./users/get-admin-user-comment-list.js";
import {
  getAdminUserListHandler,
  getAdminUserListRoute,
} from "./users/get-admin-user-list.js";
import {
  getAdminUserOrgListHandler,
  getAdminUserOrgListRoute,
} from "./users/get-admin-user-org-list.js";
import {
  getAdminUserPublicationListHandler,
  getAdminUserPublicationListRoute,
} from "./users/get-admin-user-publication-list.js";
import {
  getAdminUserHandler,
  getAdminUserRoute,
} from "./users/get-admin-user.js";
import {
  patchAdminUserHandler,
  patchAdminUserRoute,
} from "./users/patch-admin-user.js";

const app = new OpenAPIHono<AdminEnv>();

// Registered before the routes so it gates every one of them.
app.use("*", requireAdminScope);

const adminRouter = app
  // POST /doi-audits
  .openapi(postDoiAuditRoute, postDoiAuditHandler)
  // GET /doi-audits/{jobId}
  .openapi(getDoiAuditRoute, getDoiAuditHandler)
  // GET /doi-comparisons
  .openapi(getDoiComparisonRoute, getDoiComparisonHandler)
  // POST /doi-pushes
  .openapi(postDoiPushRoute, postDoiPushHandler)
  // GET /org-slug-availability
  .openapi(getAdminOrgSlugAvailabilityRoute, getAdminOrgSlugAvailabilityHandler)
  // GET /orgs
  .openapi(getAdminOrgListRoute, getAdminOrgListHandler)
  // POST /orgs
  .openapi(postAdminOrgRoute, postAdminOrgHandler)
  // GET /orgs/{idOrSlug}
  .openapi(getAdminOrgRoute, getAdminOrgHandler)
  // PATCH /orgs/{idOrSlug}
  .openapi(patchAdminOrgRoute, patchAdminOrgHandler)
  // GET /orgs/{idOrSlug}/members
  .openapi(getAdminListMembersRoute, getAdminListMembersHandler)
  // POST /orgs/{idOrSlug}/members
  .openapi(postAdminOrgMemberRoute, postAdminOrgMemberHandler)
  // PATCH /orgs/{idOrSlug}/members/{memberId}
  .openapi(patchAdminOrgMemberRoute, patchAdminOrgMemberHandler)
  // DELETE /orgs/{idOrSlug}/members/{memberId}
  .openapi(deleteAdminOrgMemberRoute, deleteAdminOrgMemberHandler)
  // GET /orgs/{idOrSlug}/publications
  .openapi(getAdminOrgPublicationsRoute, getAdminOrgPublicationsHandler)
  // GET /publications
  .openapi(getAdminPublicationListRoute, getAdminPublicationListHandler)
  // GET /publications/{idOrSlug}
  .openapi(getAdminPublicationRoute, getAdminPublicationHandler)
  // PATCH /publications/{idOrSlug}
  .openapi(patchAdminPublicationRoute, patchAdminPublicationHandler)
  // GET /publications/{idOrSlug}/versions/{versionNumber}
  .openapi(getAdminPublicationVersionRoute, getAdminPublicationVersionHandler)
  // GET /users
  .openapi(getAdminUserListRoute, getAdminUserListHandler)
  // GET /users/{id}
  .openapi(getAdminUserRoute, getAdminUserHandler)
  // PATCH /users/{id}
  .openapi(patchAdminUserRoute, patchAdminUserHandler)
  // GET /users/{id}/publications
  .openapi(getAdminUserPublicationListRoute, getAdminUserPublicationListHandler)
  // GET /users/{id}/comments
  .openapi(getAdminUserCommentListRoute, getAdminUserCommentListHandler)
  // GET /users/{id}/orgs
  .openapi(getAdminUserOrgListRoute, getAdminUserOrgListHandler);

export default adminRouter;
