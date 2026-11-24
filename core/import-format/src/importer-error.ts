import { type $ZodIssue } from "zod/v4/core";

export type ImporterErrorDetails =
  /** The user must grant Raven access to their account with `provider`. */
  | { code: "needs_authorization"; provider: string; scopes: string[] }
  | { code: "not_found" }
  | { code: "forbidden" }
  | { code: "unsupported" }
  | { code: "validation"; issues: $ZodIssue[] }
  | { code: "fetch-error" }
  | { code: "read-error" }
  /**
   * The importer hit something in the document it couldn't work around. A last
   * resort: importers should keep what they can and report a diagnostic.
   */
  | { code: "conversion-failed" };
export type ImporterErrorCode = ImporterErrorDetails["code"];

/**
 * Throw from an importer to report a failure Raven can act on, such as asking
 * the user for more permissions. Any other error is reported as unexpected.
 */
export class ImporterError extends Error {
  override readonly name = "ImporterError";

  constructor(
    readonly details: ImporterErrorDetails,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }

  get code(): ImporterErrorCode {
    return this.details.code;
  }
}
