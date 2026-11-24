import type { ResolvedProfile } from "./config/profiles.js";
import { CliError, ExitCode } from "./errors.js";

/**
 * How a command uses credentials. Mirrors the v1 OpenAPI spec: routes with a
 * `security` requirement are `required`; the rest are `none` or `optional`.
 */
export type AuthLevel = "none" | "optional" | "required";

export function tokenForRequest(
  level: AuthLevel,
  profile: ResolvedProfile,
  anonymous: boolean
): string | undefined {
  if (level === "none") return undefined;

  if (level === "optional") return anonymous ? undefined : profile.token;

  if (anonymous) {
    throw new CliError(
      "--anonymous can't be used with this command; it needs a login",
      ExitCode.Usage
    );
  }
  if (profile.token === undefined) {
    const profileName = profile.name ?? "<name>";
    throw new CliError(
      `this command needs a login; run raven auth login --profile ${profileName}`,
      ExitCode.Auth
    );
  }
  return profile.token;
}
