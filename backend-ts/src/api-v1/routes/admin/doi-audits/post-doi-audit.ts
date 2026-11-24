import { makeRepositories } from "#v1/db-repositories/index.js";
import { createAdminRoute } from "#v1/lib/create-admin-route.js";
import { type AdminEnv } from "#v1/routes/admin/middleware/require-admin-scope.js";
import {
  type HandlerContext,
  type HandlerReturnType,
} from "#v1/types/handler.js";
import {
  buildDoiAuditResponse,
  startDoiAuditJob,
} from "./helpers/doi-audit-jobs.js";
import { AdminDoiAuditResponseSchema } from "./route-responses/doi-audit.js";

// ---------------------------------------------------------------------------
// POST /doi-audits — start a DOI metadata audit
// ---------------------------------------------------------------------------

export const postDoiAuditRoute = createAdminRoute({
  method: "post",
  path: "/doi-audits",
  tags: ["doi-audits"],
  summary: "Start a DOI metadata audit",
  description:
    "Compares the DataCite record of every published publication with a DOI " +
    "against the metadata The Stacks would send for it, in the background. " +
    "Site admins audit every publication; org admins only those in the orgs " +
    "they administer. A caller with an audit still running gets that one " +
    "back instead of a new one. Poll `GET /doi-audits/{jobId}` for progress. " +
    "Audits are kept for about 7 days.",
  responses: {
    202: {
      description:
        "The newly started audit, or the caller's audit that was already running.",
      content: {
        "application/json": { schema: AdminDoiAuditResponseSchema },
      },
    },
  },
});

export async function postDoiAuditHandler(
  c: HandlerContext<typeof postDoiAuditRoute, AdminEnv>
): HandlerReturnType<typeof postDoiAuditRoute> {
  const repos = makeRepositories();
  const scope = c.var.adminScope;
  const job = await startDoiAuditJob(repos, { ownerId: c.var.user.id, scope });
  return c.json(await buildDoiAuditResponse(repos, job, scope), 202);
}
