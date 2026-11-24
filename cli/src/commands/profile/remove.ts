import { AuthClient } from "#src/api/auth-client.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { readConfig, updateConfig } from "#src/config/config-file.js";
import { normalizeApiUrl, requireProfile } from "#src/config/profiles.js";
import { createLocalContext } from "#src/context.js";
import { CliError, ExitCode } from "#src/errors.js";
import { isInteractive } from "#src/runtime.js";

export const profileRemoveCommand: CommandSpec = {
  name: "remove",
  group: "profile",
  authLevel: "none",
  routes: [],
  register(parent, runtime) {
    parent
      .command("remove")
      .description(
        "Remove a profile, ending its session and deleting its token"
      )
      .argument("<name>", "Profile name")
      .option("-y, --yes", "Don't ask for confirmation")
      .action(async (name, options, command) => {
        const { output } = createLocalContext(command, runtime);
        const profile = requireProfile(
          await readConfig(runtime.configDir),
          name,
          runtime.configDir
        );
        const apiUrl = normalizeApiUrl(profile.apiUrl);

        if (options.yes !== true) {
          if (!isInteractive(runtime)) {
            throw new CliError(
              `pass --yes to remove profile ${name} without a prompt`,
              ExitCode.Usage
            );
          }
          const confirmed = await runtime.prompter.confirm({
            message: `Remove profile ${name} (${apiUrl})?`,
          });
          if (!confirmed) throw new CliError("cancelled", ExitCode.General);
        }

        const token = await runtime.tokenStore.get(name);
        if (token !== undefined) {
          await new AuthClient(apiUrl, runtime.authFetch)
            .signOut(token)
            .catch((error: unknown) =>
              output.warn(
                `couldn't end the session on the server (${(error as Error).message}); the local token was deleted anyway`
              )
            );
          await runtime.tokenStore.delete(name);
        }

        await updateConfig(runtime.configDir, (config) => {
          const { [name]: _removed, ...profiles } = config.profiles;
          const { current, ...rest } = config;
          return current === name
            ? { ...rest, profiles }
            : { ...config, profiles };
        });

        output.data({ removed: name }, () => `Removed profile ${name}`);
      });
  },
};
