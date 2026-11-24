import { DoiMetadataSchema, PUBLICATION_STATES } from "#src/db/schema.js";
import {
  ContributorResponseSchema,
  PublicationResponseSchema,
} from "#v1/routes/publications/route-responses/publication.js";
import { z } from "@hono/zod-openapi";

const AdminVersionListItemResponseSchema = z.object({
  id: z.string(),
  versionNumber: z.number(),
  versionDesc: z.string().nullable(),
  doi: z.string().nullable(),
  state: z.enum(PUBLICATION_STATES),
  createdAt: z.string(),
});

// Unlike the public response, `state` is typed as the enum, `contributors`
// include usernames, `versions` includes the current draft with each entry's
// state, `commentsCount` counts comments in every state, and `doiMetadata` is
// the DataCite metadata stored for the publication's DOIs.
export const AdminPublicationResponseSchema = PublicationResponseSchema.extend({
  state: z.enum(PUBLICATION_STATES),
  contributors: z.array(
    ContributorResponseSchema.extend({ username: z.string() })
  ),
  versions: z.array(AdminVersionListItemResponseSchema),
  commentsCount: z.number(),
  doiMetadata: DoiMetadataSchema,
});
