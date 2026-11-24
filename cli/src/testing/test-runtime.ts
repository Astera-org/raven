import type { TokenStore } from "#src/credentials/token-store.js";
import type { Prompter, SelectOption } from "#src/prompts.js";
import type { InputStream, OutputStream, Runtime } from "#src/runtime.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class MemoryStream implements OutputStream {
  text = "";
  constructor(readonly isTTY = false) {}

  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

export class MemoryTokenStore implements TokenStore {
  constructor(readonly tokens: Record<string, string> = {}) {}

  async get(profile: string): Promise<string | undefined> {
    return this.tokens[profile];
  }

  async set(profile: string, token: string): Promise<void> {
    this.tokens[profile] = token;
  }

  async delete(profile: string): Promise<void> {
    delete this.tokens[profile];
  }
}

export class MemoryInput implements InputStream {
  constructor(
    readonly content = "",
    readonly isTTY = false
  ) {}

  async readAll(): Promise<string> {
    return this.content;
  }
}

/** Answers prompts from a queue, failing if a prompt wasn't expected. */
export class ScriptedPrompter implements Prompter {
  readonly asked: string[] = [];
  readonly textDefaults: Array<string | undefined> = [];
  readonly confirmDefaults: Array<boolean | undefined> = [];

  constructor(private readonly answers: Array<string | boolean> = []) {}

  async text({
    message,
    defaultValue,
    validate,
  }: {
    message: string;
    defaultValue?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string> {
    this.textDefaults.push(defaultValue);
    const answer = String(this.next(message));
    const error = validate?.(answer);
    if (error !== undefined) throw new Error(`invalid answer: ${error}`);
    return answer;
  }

  async select<T extends string>({
    message,
    options,
  }: {
    message: string;
    options: SelectOption<T>[];
  }): Promise<T> {
    const answer = this.next(message);
    const option = options.find((o) => o.value === answer);
    if (option === undefined) {
      throw new Error(`no option ${String(answer)} for: ${message}`);
    }
    return option.value;
  }

  async password({ message }: { message: string }): Promise<string> {
    return String(this.next(message));
  }

  async confirm({
    message,
    initialValue,
  }: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean> {
    this.confirmDefaults.push(initialValue);
    return this.next(message) === true;
  }

  private next(message: string): string | boolean {
    this.asked.push(message);
    const answer = this.answers.shift();
    if (answer === undefined) throw new Error(`unexpected prompt: ${message}`);
    return answer;
  }
}

export const TEST_NOW = new Date("2026-09-23T12:00:00.000Z");

export interface TestRuntime extends Runtime {
  stdout: MemoryStream;
  stderr: MemoryStream;
  tokenStore: MemoryTokenStore;
}

export async function createTestRuntime(
  overrides: Partial<Runtime> = {}
): Promise<TestRuntime> {
  const runtime: Runtime = {
    env: {},
    stdin: new MemoryInput(),
    stdout: new MemoryStream(),
    stderr: new MemoryStream(),
    prompter: new ScriptedPrompter(),
    fetch: () => Promise.reject(new Error("fetch not stubbed")),
    authFetch: () => Promise.reject(new Error("authFetch not stubbed")),
    openUrl: () => Promise.reject(new Error("openUrl not stubbed")),
    now: () => TEST_NOW,
    configDir: await mkdtemp(join(tmpdir(), "raven-cli-test-")),
    tokenStore: new MemoryTokenStore(),
    ...overrides,
  };
  return runtime as TestRuntime;
}

/** A terminal on stdin and stderr, so commands may prompt. */
export function interactive(
  prompter: Prompter
): Pick<Runtime, "stdin" | "stderr" | "prompter"> {
  return {
    stdin: new MemoryInput("", true),
    stderr: new MemoryStream(true),
    prompter,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
