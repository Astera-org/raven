import { CliError, ExitCode } from "#src/errors.js";

export function positiveInteger(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new CliError(
      `expected a positive whole number, got "${value}"`,
      ExitCode.Usage
    );
  }
  return number;
}
