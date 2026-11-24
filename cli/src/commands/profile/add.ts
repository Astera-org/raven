import type { CommandSpec } from "#src/commands/command-spec.js";
import { apiUrlFromArgOrPrompt } from "#src/commands/server-url.js";
import { readConfig, updateConfig } from "#src/config/config-file.js";
import { profileSummary, withProfile } from "#src/config/profiles.js";
import { createLocalContext } from "#src/context.js";
import { CliError, ExitCode } from "#src/errors.js";

export const profileAddCommand: CommandSpec = {
  name: "add",
  group: "profile",
  authLevel: "none",
  routes: [],
  register(parent, runtime) {
    parent
      .command("add")
      .description("Add a profile for a server, with no user")
      .argument("<name>", "Profile name")
      .argument("[api-url]", "Server URL (prompted for if omitted)")
      .addHelpText(
        "after",
        [
          "",
          "Examples:",
          "  raven profile add local http://localhost:7001",
          "  raven profile add staging https://api.staging.thestacks.org",
        ].join("\n")
      )
      .action(async (name, apiUrlArg, _options, command) => {
        const { output } = createLocalContext(command, runtime);
        const existing = await readConfig(runtime.configDir);
        if (existing.profiles[name] !== undefined) {
          throw new CliError(
            `profile "${name}" already exists`,
            ExitCode.Usage
          );
        }

        const apiUrl = await apiUrlFromArgOrPrompt(
          apiUrlArg,
          runtime,
          `missing server URL; run raven profile add ${name} <api-url>`
        );
        const config = await updateConfig(runtime.configDir, (current) =>
          withProfile(current, name, { apiUrl })
        );
        const summary = profileSummary(config, name);

        output.data({ profile: summary }, () =>
          summary.current
            ? `Added profile ${name} (${apiUrl}), now the current profile`
            : `Added profile ${name} (${apiUrl})`
        );
      });
  },
};
