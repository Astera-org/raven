import { z } from "@hono/zod-openapi";

export const HealthResponseSchema = z
  .object({
    apiVersion: z.number().openapi({ example: 1 }),
    status: z.string().openapi({ example: "ok" }),
  })
  .openapi("Health");
