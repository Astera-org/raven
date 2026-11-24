import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import { z } from "@hono/zod-openapi";

export const GetMyPublicationListQuerySchema =
  PaginationQueryRequestSchema.extend({
    state: z
      .enum(["draft", "published"])
      .optional()
      .openapi({
        description:
          "`draft`: publications with a draft version, including published " +
          "ones with a pending new version. `published`: publications that " +
          "have been published. Omit for all of the caller's publications.",
        example: "draft",
      }),
  });
