import { z } from "@hono/zod-openapi";

export const AdminPublicationParamSchema = z.object({
  idOrSlug: z.string().openapi({
    param: { name: "idOrSlug", in: "path" },
    description: "The publication's id or slug.",
  }),
});
