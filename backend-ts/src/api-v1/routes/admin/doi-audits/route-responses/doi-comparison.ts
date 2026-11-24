import { DOI_COMPARISON_TYPES } from "#v1/routes/admin/doi-audits/route-requests/get-doi-comparison.js";
import { z } from "@hono/zod-openapi";
import { DoiComparisonSummarySchema } from "./doi-audit.js";

const DataciteAttributesSchema = z.record(z.string(), z.unknown());

export const AdminDoiComparisonResponseSchema =
  DoiComparisonSummarySchema.extend({
    publicationId: z.string(),
    slug: z.string(),
    orgName: z.string().nullable().openapi({
      description:
        "The publication's primary org, the one with the lowest priority.",
    }),
    type: z.enum(DOI_COMPARISON_TYPES),
    stacksMetadata: DataciteAttributesSchema.openapi({
      description: "Every attribute The Stacks would send DataCite.",
    }),
    dataciteMetadata: DataciteAttributesSchema.nullable().openapi({
      description: "DataCite's record, or null when `found` is false.",
    }),
    text: z.string().openapi({
      description:
        "The differing fields as plain text, for pasting into an LLM.",
    }),
    pushableFields: z.array(z.string()).openapi({
      description:
        "The differing fields a push would send. Excludes fields that are " +
        "never pushed, such as `url`.",
    }),
    dataciteUrl: z.string().openapi({
      description: "The DOI's record page in DataCite's web UI.",
    }),
    fingerprint: z.string().openapi({
      description:
        "A hash of what a push would send and DataCite's current values for " +
        "those attributes. It changes whenever either does.",
    }),
  }).openapi("AdminDoiComparison");
export type AdminDoiComparisonResponse = z.infer<
  typeof AdminDoiComparisonResponseSchema
>;
