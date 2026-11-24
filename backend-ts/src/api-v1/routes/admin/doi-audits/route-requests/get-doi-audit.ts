import { z } from "@hono/zod-openapi";

export const DoiAuditJobIdParamSchema = z.object({
  jobId: z.uuid().openapi({
    param: { name: "jobId", in: "path" },
    description: "The audit job's id, as returned when it was started.",
  }),
});
