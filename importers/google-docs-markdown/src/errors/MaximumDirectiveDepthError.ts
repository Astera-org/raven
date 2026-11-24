import { ImporterError } from "@raven/core-import-format";

export const MAXIMUM_ALLOWED_DIRECTIVE_DEPTH = 32;

export class MaximumDirectiveDepthError extends ImporterError {
  constructor(
    public readonly depth: number,
    message?: string,
    options?: ErrorOptions
  ) {
    const messageToReport =
      message ??
      `Maximum directive depth of ${MAXIMUM_ALLOWED_DIRECTIVE_DEPTH} exceeded at ${depth} deep`;
    super(
      {
        code: "validation",
        issues: [{ code: "custom", path: ["body"], message: messageToReport }],
      },
      messageToReport,
      options
    );
  }
}
