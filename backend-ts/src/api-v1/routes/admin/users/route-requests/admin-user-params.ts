import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import { z } from "@hono/zod-openapi";

export const AdminUserParamSchema = z.object({
  id: ulidSchema({ fieldName: "id" }),
});
