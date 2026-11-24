import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";

export class ValidationIssuesException extends Error {
  constructor(
    public validationIssues: ValidationIssue[],
    message?: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}
