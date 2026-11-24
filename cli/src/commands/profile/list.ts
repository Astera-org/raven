import type { CommandSpec } from "#src/commands/command-spec.js";
import { readConfig } from "#src/config/config-file.js";
import { profileSummary } from "#src/config/profiles.js";
import { createLocalContext } from "#src/context.js";
import { formatTable } from "#src/output.js";

export const profileListCommand: CommandSpec = {
  name: "list",
  group: "profile",
  authLevel: "none",
  routes: [],
  register(parent, runtime) {
    parent
      .command("list")
      .description("List profiles; * marks the current one")
      .action(async (_options, command) => {
        const { output } = createLocalContext(command, runtime);
        const config = await readConfig(runtime.configDir);
        const profiles = Object.keys(config.profiles)
          .sort()
          .map((name) => profileSummary(config, name));

        output.data({ profiles }, () => {
          if (profiles.length === 0) {
            return "No profiles. Add one with raven profile add <name> <api-url>";
          }
          return formatTable(
            ["", "NAME", "SERVER", "USER"],
            profiles.map(({ name, apiUrl, user, current }) => [
              current ? "*" : "",
              name,
              apiUrl,
              user ?? "anonymous",
            ])
          );
        });
      });
  },
};
