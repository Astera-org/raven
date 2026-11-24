import { paginatedResponse } from "#v1/lib/route-responses/pagination.js";
import { z } from "@hono/zod-openapi";

export const CandidateOrgResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  avatar: z.string().nullable(),
  doiMintingEnabled: z.boolean().nullable(),
});

export const CandidateOrgListResponseSchema = paginatedResponse(
  CandidateOrgResponseSchema
);
