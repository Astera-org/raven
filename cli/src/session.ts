import { AuthClient, type SessionInfo } from "./api/auth-client.js";
import type { AuthLevel } from "./auth-level.js";
import { updateConfig } from "./config/config-file.js";
import type { ResolvedProfile } from "./config/profiles.js";
import { CliError, ExitCode } from "./errors.js";
import type { Output } from "./output.js";
import type { Runtime } from "./runtime.js";

export function loginHint(profileName: string | undefined): string {
  return `raven auth login --profile ${profileName ?? "<name>"}`;
}

export function rejectedTokenError(profile: ResolvedProfile): CliError {
  const message =
    profile.tokenSource === "env"
      ? `${profile.apiUrl} rejected the token in RAVEN_TOKEN`
      : `the session for profile ${profile.name} has expired or was revoked; run ${loginHint(profile.name)}`;
  return new CliError(message, ExitCode.Auth);
}

export async function saveSessionExpiry(
  runtime: Runtime,
  profileName: string,
  sessionExpiresAt: string
): Promise<void> {
  await updateConfig(runtime.configDir, (config) => {
    const profile = config.profiles[profileName];
    if (profile === undefined) return config;
    return {
      ...config,
      profiles: {
        ...config.profiles,
        [profileName]: { ...profile, sessionExpiresAt },
      },
    };
  });
}

/**
 * Checks a stored session that looks expired. Sessions are extended while in
 * use, so a passed `sessionExpiresAt` is re-checked with the server first and
 * refreshed if the session is still valid. If the session is gone, optional
 * commands warn and continue anonymously; required commands fail before
 * sending their request. If the check itself fails, the command continues and
 * its own request decides.
 */
export async function checkStoredSession(
  profile: ResolvedProfile,
  authLevel: AuthLevel,
  runtime: Runtime,
  output: Output
): Promise<void> {
  const { name, token, tokenSource, sessionExpiresAt } = profile;
  if (name === undefined || token === undefined || tokenSource !== "store") {
    return;
  }
  if (
    sessionExpiresAt !== undefined &&
    new Date(sessionExpiresAt) > runtime.now()
  ) {
    return;
  }

  let session: SessionInfo | undefined;
  try {
    session = await new AuthClient(
      profile.apiUrl,
      runtime.authFetch
    ).getSession(token);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    output.warn(`couldn't check the session for profile ${name}: ${reason}`);
    return;
  }
  if (session !== undefined) {
    await saveSessionExpiry(runtime, name, session.expiresAt);
    return;
  }
  if (authLevel === "required") throw rejectedTokenError(profile);
  output.warn(
    `the session for profile ${name} has expired; results are what an anonymous user sees. Run ${loginHint(name)}`
  );
}
