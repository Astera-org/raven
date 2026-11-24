import { AuthClient } from "#src/api/auth-client.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { readConfig, updateConfig } from "#src/config/config-file.js";
import {
  normalizeApiUrl,
  requireProfile,
  selectedProfileName,
  tokenFromEnv,
} from "#src/config/profiles.js";
import { createLocalContext } from "#src/context.js";
import { CliError, ExitCode } from "#src/errors.js";

const ENV_TOKEN_NOT_REVOKED =
  "RAVEN_TOKEN is set and logout doesn't revoke it; commands keep using it until you unset it";

export const authLogoutCommand: CommandSpec = {
  name: "logout",
  group: "auth",
  authLevel: "none",
  routes: [],
  register(parent, runtime) {
    parent
      .command("logout")
      .description(
        "End the session on the server and delete the token; the profile stays"
      )
      .action(async (_options, command) => {
        const { options, output } = createLocalContext(command, runtime);
        const config = await readConfig(runtime.configDir);
        const name = selectedProfileName(options, config, runtime.env);
        const envTokenSet = tokenFromEnv(runtime.env) !== undefined;
        if (name === undefined) {
          throw new CliError(
            envTokenSet
              ? `no profile selected; ${ENV_TOKEN_NOT_REVOKED}`
              : "no profile selected; pass --profile <name>",
            ExitCode.Usage
          );
        }
        const profile = requireProfile(config, name, runtime.configDir);
        const apiUrl = normalizeApiUrl(profile.apiUrl);

        const token = await runtime.tokenStore.get(name);
        if (token !== undefined) {
          await new AuthClient(apiUrl, runtime.authFetch)
            .signOut(token)
            .catch((error: unknown) => {
              // An API error means the session is already gone on the server.
              if (
                error instanceof CliError &&
                error.exitCode === ExitCode.Auth
              ) {
                return;
              }
              output.warn(
                `couldn't end the session on the server (${(error as Error).message}); the local token was deleted anyway`
              );
            });
          await runtime.tokenStore.delete(name);
        }

        const wasLoggedIn = token !== undefined || profile.user !== undefined;
        await updateConfig(runtime.configDir, (current) => {
          const {
            user: _user,
            sessionExpiresAt: _expiry,
            ...rest
          } = current.profiles[name] ?? profile;
          return {
            ...current,
            profiles: { ...current.profiles, [name]: rest },
          };
        });

        output.data({ profile: name, loggedOut: wasLoggedIn }, () =>
          wasLoggedIn
            ? `Logged out of ${apiUrl} (profile ${name})`
            : `Profile ${name} wasn't logged in`
        );
        if (envTokenSet) {
          output.warn(ENV_TOKEN_NOT_REVOKED);
        }
      });
  },
};
