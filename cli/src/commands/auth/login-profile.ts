import { apiUrlFromArgOrPrompt } from "#src/commands/server-url.js";
import type { RavenConfig } from "#src/config/config-file.js";
import {
  normalizeApiUrl,
  profileNameForApiUrl,
  profilesForApiUrl,
} from "#src/config/profiles.js";
import { CliError, ExitCode } from "#src/errors.js";
import type { Runtime } from "#src/runtime.js";

export interface LoginTarget {
  name: string;
  apiUrl: string;
  /** What the profile already stores; login fills in what's missing. */
  identifiers: {
    id?: string | undefined;
    hostname?: string | null | undefined;
  };
}

/**
 * Chooses the profile `raven auth login` logs in to:
 * - `--profile <name> <api-url>` creates or reuses `<name>` at `<api-url>`.
 * - `--profile <name>` uses an existing profile.
 * - `<api-url>` uses the one profile at that server, or creates one named
 *   after its host.
 * - Neither uses `RAVEN_PROFILE`, then `current`, then asks for a server.
 */
export async function chooseLoginTarget(
  profileOption: string | undefined,
  apiUrlArg: string | undefined,
  config: RavenConfig,
  runtime: Runtime
): Promise<LoginTarget> {
  if (profileOption !== undefined) {
    return namedTarget(profileOption, apiUrlArg, config);
  }
  if (apiUrlArg !== undefined) {
    return targetForApiUrl(normalizeApiUrl(apiUrlArg), config);
  }

  const resolvedName = runtime.env.RAVEN_PROFILE || config.current;
  if (resolvedName !== undefined) {
    return namedTarget(resolvedName, undefined, config);
  }

  const apiUrl = await apiUrlFromArgOrPrompt(
    undefined,
    runtime,
    "no profile selected; run raven auth login <api-url> or raven auth login --profile <name>"
  );
  return targetForApiUrl(apiUrl, config);
}

function namedTarget(
  name: string,
  apiUrlArg: string | undefined,
  config: RavenConfig
): LoginTarget {
  const existing = config.profiles[name];
  if (apiUrlArg === undefined) {
    if (existing === undefined) {
      throw new CliError(
        `profile "${name}" doesn't exist; run raven auth login --profile ${name} <api-url> to create it`,
        ExitCode.Usage
      );
    }
    return {
      name,
      apiUrl: normalizeApiUrl(existing.apiUrl),
      identifiers: { id: existing.id, hostname: existing.hostname },
    };
  }

  const apiUrl = normalizeApiUrl(apiUrlArg);
  if (existing !== undefined && normalizeApiUrl(existing.apiUrl) !== apiUrl) {
    throw new CliError(
      `profile "${name}" already uses ${normalizeApiUrl(existing.apiUrl)}, not ${apiUrl}`,
      ExitCode.Usage
    );
  }
  return {
    name,
    apiUrl,
    identifiers: { id: existing?.id, hostname: existing?.hostname },
  };
}

function targetForApiUrl(apiUrl: string, config: RavenConfig): LoginTarget {
  const matches = profilesForApiUrl(config, apiUrl);
  if (matches.length > 1) {
    throw new CliError(
      `several profiles use ${apiUrl} (${matches.join(", ")}); pick one with --profile <name>`,
      ExitCode.Usage
    );
  }
  const [match] = matches;
  if (match !== undefined) {
    const profile = config.profiles[match];
    return {
      name: match,
      apiUrl,
      identifiers: { id: profile?.id, hostname: profile?.hostname },
    };
  }

  const name = profileNameForApiUrl(apiUrl);
  if (config.profiles[name] !== undefined) {
    throw new CliError(
      `profile "${name}" already exists for a different server; pick a name with --profile <name>`,
      ExitCode.Usage
    );
  }
  return { name, apiUrl, identifiers: {} };
}
