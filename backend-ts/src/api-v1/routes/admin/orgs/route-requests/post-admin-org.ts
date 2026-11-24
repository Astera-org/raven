import { CreateOrgBodySchema } from "#v1/routes/orgs/schemas.js";
import { AdminUpdateOrgBodySchema } from "./patch-admin-org.js";

export const PostAdminOrgBodySchema = CreateOrgBodySchema.extend(
  AdminUpdateOrgBodySchema.pick({
    slug: true,
    rorId: true,
    doiPrefix: true,
    doiMintingEnabled: true,
    unlisted: true,
  }).shape
).openapi("CreateAdminOrgBody");
