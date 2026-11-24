import { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import { z } from "@hono/zod-openapi";

export const ADMIN_ORGS_LIST_SORT_KEYS = [
  "created",
  "members",
  "name",
  "publications",
] as const;
export type AdminOrgsListSortKey = (typeof ADMIN_ORGS_LIST_SORT_KEYS)[number];
export const ADMIN_ORGS_LIST_SORT_KEYS_NEGATIVE = [
  "-created",
  "-members",
  "-name",
  "-publications",
] as const;

export const AdminGetOrgsListRequestSchema =
  PaginationQueryRequestSchema.extend({
    sort: z
      .enum([
        ...ADMIN_ORGS_LIST_SORT_KEYS,
        ...ADMIN_ORGS_LIST_SORT_KEYS_NEGATIVE,
      ])
      .optional()
      .openapi({
        default: "-created",
        description:
          "Sort key; prefix with `-` for descending. `members` sorts by " +
          "current members and `publications` by published publications. " +
          "Ties are broken by id.",
      }),
  });
