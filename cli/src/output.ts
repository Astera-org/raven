import { styleText } from "node:util";
import type { CliError } from "./errors.js";
import type { OutputStream } from "./runtime.js";

type Style = Parameters<typeof styleText>[0];

/**
 * Writes command results to stdout and diagnostics to stderr, as JSON with
 * `--json` or as text otherwise. Colour is used only on a terminal.
 */
export class Output {
  constructor(
    private readonly stdout: OutputStream,
    private readonly stderr: OutputStream,
    readonly json: boolean,
    private readonly env: NodeJS.ProcessEnv
  ) {}

  data(value: unknown, renderText: () => string): void {
    const text = this.json ? JSON.stringify(value, null, 2) : renderText();
    this.stdout.write(`${text}\n`);
  }

  /** Writes `content` to stdout unchanged, e.g. a document. */
  text(content: string): void {
    this.stdout.write(content);
  }

  /** Reports progress on stderr, as text only: `--json` output skips it. */
  progress(message: string): void {
    if (!this.json) this.stderr.write(`${message}\n`);
  }

  /** Tells the user something they must act on, so `--json` keeps it too. */
  notice(message: string, value: unknown): void {
    const text = this.json ? JSON.stringify(value) : message;
    this.stderr.write(`${text}\n`);
  }

  warn(message: string): void {
    if (this.json) {
      this.stderr.write(`${JSON.stringify({ warning: message })}\n`);
      return;
    }
    this.stderr.write(
      `${this.style("yellow", "Warning:", this.stderr)} ${message}\n`
    );
  }

  error(error: CliError): void {
    if (this.json) {
      const payload = {
        error: {
          code: error.code,
          exitCode: error.exitCode,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      };
      this.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }
    this.stderr.write(
      `${this.style("red", "Error:", this.stderr)} ${error.message}\n`
    );
  }

  private style(format: Style, text: string, stream: OutputStream): string {
    const colour =
      stream.isTTY === true &&
      this.env.NO_COLOR === undefined &&
      this.env.TERM !== "dumb";
    return colour ? styleText(format, text, { validateStream: false }) : text;
  }
}

const FIELD_GAP = 2;

export function formatFields(rows: ReadonlyArray<[string, string]>): string {
  const labels = rows.map(([label]) => `${label}:`);
  const width = Math.max(...labels.map((label) => label.length)) + FIELD_GAP;
  return rows
    .map(([, value], index) => {
      const indented = value.replaceAll("\n", `\n${" ".repeat(width)}`);
      return `${labels[index]?.padEnd(width)}${indented}`;
    })
    .join("\n");
}

export function formatTable(
  header: readonly string[],
  rows: ReadonlyArray<readonly string[]>
): string {
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0))
  );
  return [header, ...rows]
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join(" ".repeat(FIELD_GAP))
        .trimEnd()
    )
    .join("\n");
}
