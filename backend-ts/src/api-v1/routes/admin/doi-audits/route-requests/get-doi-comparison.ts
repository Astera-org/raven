import { DOI_REGEX } from "#src/lib/datacite/doi-regex.js";
import { z } from "@hono/zod-openapi";

export const DOI_COMPARISON_TYPES = ["canonical", "version"] as const;
export type DoiComparisonType = (typeof DOI_COMPARISON_TYPES)[number];

export const GetDoiComparisonQuerySchema = z.object({
  type: z.enum(DOI_COMPARISON_TYPES).openapi({
    description:
      "`canonical` for the publication's concept DOI, `version` for its " +
      "latest published version's DOI.",
  }),
  doi: z
    .string()
    .regex(DOI_REGEX)
    .openapi({ description: "The DOI to compare.", example: "10.83972/abcd" }),
});
