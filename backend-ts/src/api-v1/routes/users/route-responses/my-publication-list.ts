import { paginatedResponse } from "#v1/lib/route-responses/pagination.js";
import { z } from "@hono/zod-openapi";

export const MyPublicationListItemResponseSchema = z.object({
  publicationId: z.string(),
  slug: z.string(),
  state: z.string(),
  versionId: z.string().openapi({
    description:
      "The publication's newest version: its draft, if it has one, " +
      "otherwise its latest published version.",
  }),
  versionNumber: z.number(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const MyPublicationListResponseSchema = paginatedResponse(
  MyPublicationListItemResponseSchema
);
