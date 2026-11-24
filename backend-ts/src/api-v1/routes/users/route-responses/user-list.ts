import { paginatedResponse } from "#v1/lib/route-responses/pagination.js";
import { NonOwnerUserResponseSchema } from "#v1/lib/route-responses/user.js";

export const UserListResponseSchema = paginatedResponse(
  NonOwnerUserResponseSchema
);
