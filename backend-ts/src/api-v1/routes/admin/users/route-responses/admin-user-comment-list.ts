import { paginatedResponse } from "#v1/lib/route-responses/pagination.js";
import { z } from "@hono/zod-openapi";

const UtcDateTimeSchema = z.iso.datetime({ precision: 3 });

export const AdminUserCommentResponseSchema = z
  .object({
    id: z.string(),
    body: z.string(),
    createdAt: UtcDateTimeSchema.nullable(),
    publication: z.object({
      id: z.string(),
      slug: z.string(),
      title: z
        .string()
        .nullable()
        .openapi({
          description:
            "The title of the publication's current version. Null when that " +
            "version is untitled, or when the publication has no current " +
            "version.",
        }),
    }),
  })
  .openapi("AdminUserComment");
export type AdminUserCommentResponse = z.infer<
  typeof AdminUserCommentResponseSchema
>;

export const AdminUserCommentListResponseSchema = paginatedResponse(
  AdminUserCommentResponseSchema
);
export type AdminUserCommentListResponse = z.infer<
  typeof AdminUserCommentListResponseSchema
>;
