import { z } from "@hono/zod-openapi";

export const PaginationResponseSchema = z
  .object({
    total: z.number().openapi({ example: 42 }),
    page: z.number().openapi({ example: 1 }),
    perPage: z.number().openapi({ example: 20 }),
  })
  .openapi("Pagination");

export type PaginationResponseV1 = z.infer<typeof PaginationResponseSchema>;

export type PaginatedResponseV1<T> = {
  pagination: PaginationResponseV1;
  items: T[];
};

export function paginatedResponse<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    pagination: PaginationResponseSchema,
  });
}

export function extendedPaginatedResponse<
  T extends z.ZodTypeAny,
  TPagination extends z.ZodRawShape,
>(itemSchema: T, paginationExtension: TPagination) {
  return z.object({
    items: z.array(itemSchema),
    pagination: PaginationResponseSchema.extend(paginationExtension),
  });
}
