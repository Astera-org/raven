import { getConfig } from "#src/config.js";
import { Writable } from "node:stream";
import pino from "pino";
import pretty from "pino-pretty";

const LEVELS: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function meetsMinLevel(chunk: Buffer, minLevel: number): boolean {
  try {
    return (
      (JSON.parse(chunk.toString()) as { level: number }).level >= minLevel
    );
  } catch {
    // Unparsable chunk (shouldn't normally happen) — write it through.
    return true;
  }
}

// Console destination: filters by level, then forwards to whatever
// `dest` is currently set to — raw stdout by default, swapped to a
// pretty-printed stream in dev by configureLogLevel().
class ConsoleGateStream extends Writable {
  minLevel: number = 30;
  dest: Writable = process.stdout;

  override _write(
    chunk: Buffer,
    enc: BufferEncoding,
    done: (error?: Error | null) => void
  ) {
    if (meetsMinLevel(chunk, this.minLevel)) {
      this.dest.write(chunk, enc, done);
    } else {
      done();
    }
  }
}

// Filters by level, then forwards writes to dest when set; null means file
// logging is disabled (dev mode).
class GateStream extends Writable {
  minLevel: number = 30;
  dest: Writable | null = null;

  override _write(
    chunk: Buffer,
    _enc: BufferEncoding,
    done: (error?: Error | null) => void
  ) {
    // dest is a pino.transport() thread-stream, whose write() ignores
    // callbacks.
    if (meetsMinLevel(chunk, this.minLevel)) {
      this.dest?.write(chunk);
    }
    done();
  }
}

const consoleStream = new ConsoleGateStream();
const gatedFile = new GateStream();

export const logger = pino(
  {
    level: "debug",
    // No custom `timestamp` — default epoch-ms `time` is timezone-agnostic
    // and correct for storage/parsing in test/prod. In dev, pino-pretty's
    // `translateTime: "SYS:..."` converts it using the system TZ for display.
    formatters: {
      level: (label, number) => {
        return {
          label,
          level: number,
        };
      },
    },
  },
  pino.multistream([
    { stream: consoleStream, level: "trace" },
    { stream: gatedFile, level: "debug" },
  ])
);

export function configureLogLevel(): void {
  const {
    SERVER_DEBUG,
    LOG_LEVEL: level,
    LOG_FILE,
    LOG_ROTATION,
    LOG_MAX_SIZE,
    LOG_TO_FILE,
  } = getConfig();
  // eslint-disable-next-line no-console
  console.log("Configuring log level to", level);
  consoleStream.minLevel = LEVELS[level] ?? 30;
  gatedFile.minLevel = LEVELS[level] ?? 30;

  consoleStream.dest = SERVER_DEBUG
    ? pretty({
        colorize: process.stdout.isTTY ?? false,
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l o",
      })
    : process.stdout;

  // LOG_TO_FILE overrides the default; otherwise file logging is off in debug/dev mode.
  const enableFile = LOG_TO_FILE !== null ? LOG_TO_FILE : !SERVER_DEBUG;
  if (enableFile) {
    gatedFile.dest = pino.transport({
      target: "pino-roll",
      options: {
        file: LOG_FILE,
        frequency: LOG_ROTATION,
        mkdir: true,
        size: LOG_MAX_SIZE,
        dateFormat: "yyyy-MM-dd-HH-mm-ss",
        extension: ".log",
      },
    });
  }
}
