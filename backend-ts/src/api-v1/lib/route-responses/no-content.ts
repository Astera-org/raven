import type { Context, TypedResponse } from "hono";

type NoContentResponse = Response &
  TypedResponse<Record<never, never>, 204, "body">;

/**
 * A typed empty 204 response for `app.openapi(...)` handlers that is
 * zod-openapi compatible.
 *
 * Typed with empty-object data rather than `null` because zod-openapi types
 * responses without `content` as `TypedResponse<{}, ...>`.
 */
export function noContentResponse<TContext extends Context>(
  c: TContext
): NoContentResponse {
  return c.body(null, 204) as Response as NoContentResponse;
}
