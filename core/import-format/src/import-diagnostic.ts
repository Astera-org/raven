import { z } from "zod";
import { DiagnosticExcerptSchema } from "./diagnostic-excerpt.js";

/**
 * A span of a text field, in the form editors like Monaco expect: 1-based
 * lines and columns (UTF-16 code units), with the end column exclusive.
 */
export const SourceRangeSchema = z.object({
  startLine: z.number().int().min(1),
  startColumn: z.number().int().min(1),
  endLine: z.number().int().min(1),
  endColumn: z.number().int().min(1),
});
export type SourceRange = z.infer<typeof SourceRangeSchema>;

/**
 * A problem the importer worked around rather than failing the import, e.g.
 * content it kept as plain text because it couldn't be converted.
 */
export const ImportDiagnosticSchema = z.object({
  /** Stable identifier for the kind of problem, e.g. `media-missing-attribute`. */
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  /** The publication field the problem is in, e.g. `["body"]`. */
  path: z.array(z.union([z.string(), z.number()])).default([]),
  /** Where in that field, when the importer could tell. */
  range: SourceRangeSchema.optional(),
  /**
   * The text around `range` when the import was stored. Raven adds it with
   * `buildDiagnosticExcerpt`; importers leave it out.
   */
  excerpt: DiagnosticExcerptSchema.optional(),
});
export type ImportDiagnostic = z.output<typeof ImportDiagnosticSchema>;
export type ImportDiagnosticInput = z.input<typeof ImportDiagnosticSchema>;
