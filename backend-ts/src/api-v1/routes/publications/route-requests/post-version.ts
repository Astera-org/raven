import { z } from "@hono/zod-openapi";

export const PostVersionBodySchema = z.object({
  note: z
    .string()
    .min(1)
    .optional()
    .nullable()
    .openapi({
      description:
        "Version description for this publish. Required unless this is the " +
        "publication's first version.",
    }),
});
