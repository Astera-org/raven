import { paginatedResponse } from "#v1/lib/route-responses/pagination.js";
import { z } from "@hono/zod-openapi";

const zStrNull = z.string().nullable();

const PublicationListContributorResponseSchema = z.object({
  userId: z.string(),
  firstName: zStrNull,
  lastName: zStrNull,
  avatar: zStrNull,
});
export type PublicationListContributorResponse = z.infer<
  typeof PublicationListContributorResponseSchema
>;

export const PublicationListOrgResponseSchema = z.object({
  orgId: z.string(),
  slug: z.string(),
  name: z.string(),
  avatar: zStrNull,
  priority: z.number().nullable(),
});
export type PublicationListOrgResponse = z.infer<
  typeof PublicationListOrgResponseSchema
>;

export const PublicationListItemResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  doi: zStrNull,
  state: z.string(),
  versionNumber: z.number().nullable(),
  title: zStrNull,
  abstract: zStrNull,
  createdAt: z.string(),
  contributors: z.array(PublicationListContributorResponseSchema),
  orgs: z.array(PublicationListOrgResponseSchema),
  tags: z.array(z.string()),
  commentsCount: z.number(),
});
export type PublicationListItemResponse = z.infer<
  typeof PublicationListItemResponseSchema
>;

export const PublicationListResponseSchema = paginatedResponse(
  PublicationListItemResponseSchema
);
