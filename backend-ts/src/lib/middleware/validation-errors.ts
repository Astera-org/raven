import { type SourceRange, SourceRangeSchema } from "@raven/core-import-format";
import { type TypedResponse } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

// Mirrors Zod's $ZodIssueBase (and the frontend's ValidationIssue type) so
// a Zod safeParse result can be passed straight through with no reshaping.
// Key has removed symbol as it isn't a JSON type.
export const propertyKeySchema = z.union([z.string(), z.number(), z.null()]);
export const ValidationIssueSchema = z.object({
  code: z.string().optional(),
  path: z.array(propertyKeySchema),
  message: z.string(),
  // Set for issues that point into a text field, e.g. import diagnostics, so
  // clients can mark them in an editor.
  severity: z.enum(["error", "warning"]).optional(),
  range: SourceRangeSchema.optional(),
});
type ValidationIssueResponse = z.infer<typeof ValidationIssueSchema>;
export type ValidationIssue = Omit<z.core.$ZodIssueBase, "path"> & {
  path: (PropertyKey | null)[];
  severity?: "error" | "warning";
  range?: SourceRange;
};

export type JsonValidationErrorsParams = [issues: ValidationIssue[]];

export type JsonValidationErrorsContext = {
  validationErrors: (...params: JsonValidationErrorsParams) => Response &
    TypedResponse<
      {
        type: "validation_error";
        errors: ValidationIssueResponse[];
        error: string;
      },
      422,
      "json"
    >;
};

export const JsonValidationErrorsMiddlewareReturnSchema = z.object({
  type: z.literal("validation_error"),
  errors: z.array(ValidationIssueSchema),
  error: z.string(),
});

export const jsonValidationErrorsMiddleware = createMiddleware<{
  Variables: JsonValidationErrorsContext;
}>(async (c, next) => {
  c.set("validationErrors", (issues: ValidationIssue[]) => {
    return c.json<
      z.infer<typeof JsonValidationErrorsMiddlewareReturnSchema>,
      422
    >(
      {
        type: "validation_error" as const,
        // Cast the type because of path being a union including symbol
        errors: issues.map((issue) => ({
          ...issue,
          path: issue.path.map<string | number | null>((level) =>
            typeof level === "string" || typeof level === "number"
              ? level
              : // Return symbols as null. As we shouldn't have symbols anywhere, this
                // shouldn't be an issue
                null
          ),
        })),
        // For legacy, this just allows the old PublicationEditor to read errors
        error: issues[0]?.message ?? "An unexpected error occurred",
      },
      422
    );
  });
  await next();
});

export const ValidationIssuesResponse = {
  422: {
    description:
      "The request's path parameters, query, headers, cookies, or body " +
      "failed validation.",
    content: {
      "application/json": {
        schema: JsonValidationErrorsMiddlewareReturnSchema,
      },
    },
  },
};
