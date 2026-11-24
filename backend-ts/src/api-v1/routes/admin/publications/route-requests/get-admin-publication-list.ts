import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import { z } from "@hono/zod-openapi";

export const ADMIN_PUBLICATION_STATE_FILTERS = [
  "all",
  "published",
  "draft",
  "removed",
] as const;
export type AdminPublicationStateFilter =
  (typeof ADMIN_PUBLICATION_STATE_FILTERS)[number];

export const GetAdminPublicationListQuerySchema =
  PaginationQueryRequestSchema.extend({
    state: z
      .enum(ADMIN_PUBLICATION_STATE_FILTERS)
      .default("all")
      .openapi({
        description:
          "Filter by publication state. `draft` means never published; a " +
          "published publication with a pending new version counts as " +
          "`published`. `all` is every publication, removed ones included. " +
          "`removed` lists publications whose `state` is `DELETED`, published " +
          "or not.",
        example: "draft",
      }),
    q: z
      .string()
      .optional()
      .openapi({
        description:
          "Case-insensitive substring match against the publication's slug " +
          "or its title: the latest published version's title for a " +
          "published publication, the current draft's title for a " +
          "never-published one.",
        example: "cell division",
      }),
  });
export type GetAdminPublicationListQuery = z.infer<
  typeof GetAdminPublicationListQuerySchema
>;
