export const ExitCode = {
  Success: 0,
  General: 1,
  Usage: 2,
  Auth: 3,
  NotFound: 4,
  Validation: 5,
  Network: 6,
  Server: 7,
  Conflict: 8,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

const errorCodes: Record<ExitCode, string> = {
  [ExitCode.Success]: "ok",
  [ExitCode.General]: "error",
  [ExitCode.Usage]: "usage",
  [ExitCode.Auth]: "auth",
  [ExitCode.NotFound]: "not_found",
  [ExitCode.Validation]: "validation",
  [ExitCode.Network]: "network",
  [ExitCode.Server]: "server",
  [ExitCode.Conflict]: "conflict",
};

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "CliError";
  }

  get code(): string {
    return errorCodes[this.exitCode];
  }
}

export function exitCodeForStatus(status: number): ExitCode {
  if (status === 401 || status === 403) return ExitCode.Auth;
  if (status === 404) return ExitCode.NotFound;
  if (status === 400 || status === 422) return ExitCode.Validation;
  if (status === 409 || status === 412) return ExitCode.Conflict;
  if (status >= 500) return ExitCode.Server;
  return ExitCode.General;
}

export function apiError(status: number, body: unknown): CliError {
  const message =
    messageFromBody(body) ?? `request failed with status ${status}`;
  return new CliError(message, exitCodeForStatus(status), { status, body });
}

export function networkError(url: string, cause: unknown): CliError {
  const reason = describeNetworkCause(cause);
  return new CliError(`could not reach ${url}: ${reason}`, ExitCode.Network);
}

function describeNetworkCause(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  if (isTimeout(cause) || isTimeout(cause.cause)) return "request timed out";
  // Node's fetch wraps socket errors in `cause`. A refused connection to a
  // host with several addresses is an AggregateError with an empty message.
  const socketError = cause.cause instanceof Error ? cause.cause : cause;
  return (
    socketError.message ||
    errorCode(socketError) ||
    cause.message ||
    "connection failed"
  );
}

function errorCode(error: Error): string | undefined {
  return "code" in error ? String(error.code) : undefined;
}

/**
 * Extracts a readable message from v1's two error envelopes,
 * `{ type: "application_error", errors: { key: { message } } }` and the 422
 * `{ type: "validation_error", errors: [{ path, message }], error }`, and from
 * BetterAuth's `{ code, message }`.
 */
function messageFromBody(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;

  const { errors } = body;
  if (Array.isArray(errors)) {
    const messages = errors.filter(isRecord).map(formatIssue);
    if (messages.length > 0) return messages.join("; ");
  }
  if (isRecord(errors)) {
    const messages = Object.entries(errors).flatMap(([key, value]) =>
      isRecord(value) && typeof value.message === "string"
        ? [key === "root" ? value.message : `${key}: ${value.message}`]
        : []
    );
    if (messages.length > 0) return messages.join("; ");
  }
  if (typeof body.error === "string") return body.error;
  if (typeof body.message === "string") return body.message;
  return undefined;
}

function formatIssue(issue: Record<string, unknown>): string {
  const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
  const message = String(issue.message ?? "invalid value");
  return path ? `${path}: ${message}` : message;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
