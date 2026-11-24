import { paginatedResponse } from "#v1/lib/route-responses/pagination.js";
import { PublicationListItemResponseSchema } from "#v1/routes/publications/route-responses/publication-list-item.js";

export const AdminPublicationListResponseSchema = paginatedResponse(
  PublicationListItemResponseSchema
);
