import { z } from "@hono/zod-openapi";

export const AdminDoiPushResponseSchema = z
  .object({
    pushedFields: z.array(z.string()).openapi({
      description: "The differing fields sent to DataCite.",
    }),
  })
  .openapi("AdminDoiPush");
export type AdminDoiPushResponse = z.infer<typeof AdminDoiPushResponseSchema>;
