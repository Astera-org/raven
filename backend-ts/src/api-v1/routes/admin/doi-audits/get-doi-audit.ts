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
import {
  buildDoiAuditResponse,
  findDoiAuditJob,
} from "./helpers/doi-audit-jobs.js";
import { DoiAuditJobIdParamSchema } from "./route-requests/get-doi-audit.js";
import { AdminDoiAuditResponseSchema } from "./route-responses/doi-audit.js";

// ---------------------------------------------------------------------------
// GET /doi-audits/{jobId} — read a DOI metadata audit
// ---------------------------------------------------------------------------

export const getDoiAuditRoute = createAdminRoute({
  method: "get",
  path: "/doi-audits/{jobId}",
  tags: ["doi-audits"],
  summary: "Get a DOI metadata audit",
  description:
    "Progress and results so far. An org admin sees only the publications in " +
    "the orgs they administer now, whatever scope the audit ran with.",
  request: { params: DoiAuditJobIdParamSchema },
  responses: {
    200: {
      description: "The audit.",
      content: {
        "application/json": { schema: AdminDoiAuditResponseSchema },
      },
    },
    404: {
      description:
        "No audit with this id was started by the caller, or it started " +
        "more than about 7 days ago and has been deleted.",
      content: errorContent("job"),
    },
  },
});

export async function getDoiAuditHandler(
  c: HandlerContext<typeof getDoiAuditRoute, AdminEnv>
): HandlerReturnType<typeof getDoiAuditRoute> {
  const { jobId } = c.req.valid("param");
  const job = await findDoiAuditJob(jobId, c.var.user.id);
  if (!job) {
    return c.json(
      applicationError({ job: { message: "DOI audit not found" } }),
      404
    );
  }

  return c.json(
    await buildDoiAuditResponse(makeRepositories(), job, c.var.adminScope),
    200
  );
}
