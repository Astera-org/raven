import { OrgSlugSchema } from "#v1/lib/schemas/slug.js";
import { z } from "@hono/zod-openapi";

export const GetAdminOrgSlugAvailabilityQuerySchema = z.object({
  slug: OrgSlugSchema.openapi({
    param: { name: "slug", in: "query" },
    description: "The slug to check.",
    example: "arcadia-science",
  }),
});
