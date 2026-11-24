import { z } from "@hono/zod-openapi";
import { GetDoiComparisonQuerySchema } from "./get-doi-comparison.js";

// Picks type and doi rather than extending the whole query schema, so a field
// added to the comparison's query never becomes a push body field.
export const PostDoiPushBodySchema = GetDoiComparisonQuerySchema.pick({
  type: true,
  doi: true,
})
  .extend({
    fingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .openapi({
        description:
          "The `fingerprint` of the comparison the caller reviewed. The push " +
          "is refused if the current comparison's fingerprint differs.",
      }),
  })
  .openapi("AdminDoiPushBody");
