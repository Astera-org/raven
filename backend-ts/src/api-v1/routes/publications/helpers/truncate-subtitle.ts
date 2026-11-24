import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { MAX_SUBTITLE_LENGTH } from "#v1/routes/publications/route-requests/patch-publication.js";

/**
 * Non-blocking: a too-long subtitle is truncated rather than rejected
 * outright, and reported back as a warning alongside the successful response
 * so the caller can display it.
 */
export function truncateSubtitle<T extends string | null | undefined>(
  subtitle: T
): { subtitle: T; warning: ValidationIssue | undefined } {
  if (typeof subtitle !== "string" || subtitle.length <= MAX_SUBTITLE_LENGTH) {
    return { subtitle, warning: undefined };
  }
  return {
    subtitle: subtitle.slice(0, MAX_SUBTITLE_LENGTH) as T,
    warning: {
      path: ["subtitle"],
      message: `Subtitle was truncated to ${MAX_SUBTITLE_LENGTH} characters`,
    },
  };
}
