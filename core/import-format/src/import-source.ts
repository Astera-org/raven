export type ImportSource =
  | { type: "url"; url: URL }
  | { type: "file"; filename: string; mimeType: string; data: Uint8Array };
export type ImportSourceType = ImportSource["type"];
export type ImportSourceOf<T extends ImportSourceType> = Extract<
  ImportSource,
  { type: T }
>;

/** Structurally compatible with a pino logger. */
export interface ImporterLogger {
  debug(objOrMsg: unknown, msg?: string): void;
  info(objOrMsg: unknown, msg?: string): void;
  warn(objOrMsg: unknown, msg?: string): void;
  error(objOrMsg: unknown, msg?: string): void;
}

export interface ImporterContext {
  /** Use instead of the global fetch so Raven can apply its own policies. */
  fetch: typeof globalThis.fetch;
  logger: ImporterLogger;
  signal: AbortSignal;
}
