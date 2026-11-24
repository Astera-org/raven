import envPaths from "env-paths";
import { homedir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import open from "open";
import { plainFetch, type PlainFetch } from "./api/plain-fetch.js";
import {
  createTokenStore,
  type TokenStore,
} from "./credentials/token-store.js";
import { ClackPrompter, type Prompter } from "./prompts.js";

export interface OutputStream {
  write(chunk: string): boolean;
  isTTY?: boolean;
}

export interface InputStream {
  isTTY?: boolean;
  readAll(): Promise<string>;
}

/** Everything a command touches outside the process, so tests can swap it. */
export interface Runtime {
  env: NodeJS.ProcessEnv;
  stdin: InputStream;
  stdout: OutputStream;
  stderr: OutputStream;
  prompter: Prompter;
  fetch: typeof fetch;
  /** Transport for BetterAuth's `/api/auth2` endpoints; see plain-fetch.ts. */
  authFetch: PlainFetch;
  /** Opens a URL in the user's browser. */
  openUrl: (url: string) => Promise<void>;
  now: () => Date;
  configDir: string;
  tokenStore: TokenStore;
}

/** Prompts are allowed only when a person can both see and answer them. */
export function isInteractive(runtime: Runtime): boolean {
  return runtime.stdin.isTTY === true && runtime.stderr.isTTY === true;
}

/** `~/.config/raven` (or `$XDG_CONFIG_HOME/raven`), and the OS default on Windows. */
export function defaultConfigDir(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): string {
  if (env.RAVEN_CONFIG_DIR) return env.RAVEN_CONFIG_DIR;
  if (platform === "win32") return envPaths("raven", { suffix: "" }).config;
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "raven");
}

export function createDefaultRuntime(): Runtime {
  const configDir = defaultConfigDir(process.env, process.platform);
  return {
    env: process.env,
    stdin: {
      isTTY: process.stdin.isTTY,
      readAll: () => text(process.stdin),
    },
    stdout: process.stdout,
    stderr: process.stderr,
    prompter: new ClackPrompter(),
    fetch: globalThis.fetch,
    authFetch: plainFetch,
    openUrl: async (url) => {
      await open(url);
    },
    now: () => new Date(),
    configDir,
    tokenStore: createTokenStore(configDir),
  };
}
