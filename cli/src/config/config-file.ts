import { CliError, ExitCode } from "#src/errors.js";
import { isMissingFile } from "#src/fs-errors.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import { z } from "zod";

export const CONFIG_FILE_NAME = "config.toml";

export const ApiUrlSchema = z.url({ protocol: /^https?$/ }).refine((url) => {
  const parsed = new URL(url);
  return parsed.protocol !== "http:" || parsed.hostname === "localhost";
}, "plain http URLs are only allowed for localhost");

const ProfileSchema = z.object({
  apiUrl: ApiUrlSchema,
  user: z.string().min(1).optional(),
  /** When the stored session was last known to expire; refreshed on use. */
  sessionExpiresAt: z.iso.datetime({ offset: true }).optional(),
  hostname: z.string().nullable().optional(),
  id: z.ulid().optional(),
});

const ConfigSchema = z.object({
  current: z.string().min(1).optional(),
  profiles: z.record(z.string(), ProfileSchema).default({}),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type RavenConfig = z.infer<typeof ConfigSchema>;

export function configFilePath(configDir: string): string {
  return join(configDir, CONFIG_FILE_NAME);
}

export async function readConfig(configDir: string): Promise<RavenConfig> {
  const path = configFilePath(configDir);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return { profiles: {} };
    throw error;
  }

  let raw: unknown;
  try {
    raw = parse(text);
  } catch (error) {
    throw invalidConfig(path, (error as Error).message);
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw invalidConfig(path, z.prettifyError(result.error));
  }
  return result.data;
}

export async function writeConfig(
  configDir: string,
  config: RavenConfig
): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  // TOML has no null or undefined, so drop unset optional fields first.
  const plain = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  await writeFile(configFilePath(configDir), `${stringify(plain)}\n`);
}

/** Reads the config, applies `change`, and writes the result back. */
export async function updateConfig(
  configDir: string,
  change: (config: RavenConfig) => RavenConfig
): Promise<RavenConfig> {
  const updated = change(await readConfig(configDir));
  await writeConfig(configDir, updated);
  return updated;
}

function invalidConfig(path: string, reason: string): CliError {
  return new CliError(
    `invalid config file ${path}: ${reason}`,
    ExitCode.General
  );
}
