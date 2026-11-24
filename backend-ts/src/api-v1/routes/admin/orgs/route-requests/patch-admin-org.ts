import { OrgSlugSchema } from "#v1/lib/schemas/slug.js";
import { UpdateOrgBodySchema } from "#v1/routes/orgs/schemas.js";
import { z } from "@hono/zod-openapi";

export const AdminUpdateOrgBodySchema = UpdateOrgBodySchema.omit({
  avatar: true,
})
  .extend({
    slug: OrgSlugSchema.optional(),
    rorId: z.string().nullable().optional(),
    doiPrefix: z
      .string()
      // 48+2=5 is just coming from our db schema, datacite's max suffix is 255
      .regex(
        /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/,
        "DOI prefex is limited to 50 characters with only lowercase letters, numbers, and hyphens."
      )
      .nullable()
      .optional(),
    doiMintingEnabled: z.boolean().optional(),
    unlisted: z.boolean().optional(),
  })
  .openapi("AdminUpdateOrgBody");
