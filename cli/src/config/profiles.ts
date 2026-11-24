import { CliError, ExitCode } from "#src/errors.js";
import type { Runtime } from "#src/runtime.js";
import {
  ApiUrlSchema,
  configFilePath,
  readConfig,
  type Profile,
  type RavenConfig,
} from "./config-file.js";

export const DEFAULT_API_URL = "https://api.thestacks.org";

export interface ResolvedProfile {
  /** Undefined when no profile is selected and the CLI runs anonymously. */
  name: string | undefined;
  apiUrl: string;
  user: string | undefined;
  token: string | undefined;
  /** Where `token` came from; only stored tokens have a known expiry. */
  tokenSource: "env" | "store" | undefined;
  sessionExpiresAt: string | undefined;
}

/**
 * Picks the profile from `--profile`, then `RAVEN_PROFILE`, then the config's
 * `current`. `RAVEN_API_URL` and `RAVEN_TOKEN` override the chosen profile.
 */
export async function resolveProfile(
  options: { profile?: string | undefined },
  runtime: Runtime
): Promise<ResolvedProfile> {
  const { env, configDir, tokenStore } = runtime;
  const config = await readConfig(configDir);
  const name = selectedProfileName(options, config, env);
  const profile =
    name === undefined ? undefined : requireProfile(config, name, configDir);

  const apiUrlOverride = nonEmpty(env.RAVEN_API_URL);
  const apiUrl = normalizeApiUrl(
    apiUrlOverride ?? profile?.apiUrl ?? DEFAULT_API_URL
  );

  // A stored token only goes to the server of the profile it belongs to.
  const pointsAtProfileServer =
    profile !== undefined && apiUrl === normalizeApiUrl(profile.apiUrl);
  const storedToken =
    name !== undefined && profile?.user !== undefined && pointsAtProfileServer
      ? await tokenStore.get(name)
      : undefined;
  const envToken = tokenFromEnv(env);

  return {
    name,
    apiUrl,
    user: profile?.user,
    token: envToken ?? storedToken,
    tokenSource: envToken ? "env" : storedToken ? "store" : undefined,
    sessionExpiresAt: profile?.sessionExpiresAt,
  };
}

export function selectedProfileName(
  options: { profile?: string | undefined },
  config: RavenConfig,
  env: NodeJS.ProcessEnv
): string | undefined {
  return options.profile ?? nonEmpty(env.RAVEN_PROFILE) ?? config.current;
}

export function requireProfile(
  config: RavenConfig,
  name: string,
  configDir: string
): NonNullable<RavenConfig["profiles"][string]> {
  const profile = config.profiles[name];
  if (profile === undefined) {
    throw new CliError(
      `profile "${name}" is not defined in ${configFilePath(configDir)}`,
      ExitCode.Usage
    );
  }
  return profile;
}

export function normalizeApiUrl(url: string): string {
  const result = ApiUrlSchema.safeParse(url);
  if (!result.success) {
    throw new CliError(
      `invalid server URL "${url}": expected an http(s) URL`,
      ExitCode.Usage
    );
  }
  return result.data.replace(/\/+$/, "").replace(/\/api$/, "");
}

/** The default name for a server's profile: its host, including any port. */
export function profileNameForApiUrl(apiUrl: string): string {
  return new URL(apiUrl).host;
}

export function profilesForApiUrl(
  config: RavenConfig,
  apiUrl: string
): string[] {
  return Object.entries(config.profiles)
    .filter(([, profile]) => normalizeApiUrl(profile.apiUrl) === apiUrl)
    .map(([name]) => name);
}

export function tokenFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  return nonEmpty(env.RAVEN_TOKEN);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

export interface ProfileSummary {
  name: string;
  apiUrl: string;
  user: string | null;
  current: boolean;
}

export function profileSummary(
  config: RavenConfig,
  name: string
): ProfileSummary {
  const profile = config.profiles[name];
  return {
    name,
    apiUrl: profile?.apiUrl ?? "",
    user: profile?.user ?? null,
    current: config.current === name,
  };
}

/** Sets a profile; the first profile created becomes the current one. */
export function withProfile(
  config: RavenConfig,
  name: string,
  profile: Profile
): RavenConfig {
  return {
    ...config,
    current: config.current ?? name,
    profiles: { ...config.profiles, [name]: profile },
  };
}
