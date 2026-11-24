import type { CommandSpec } from "#src/commands/command-spec.js";
import { readConfig, updateConfig } from "#src/config/config-file.js";
import { profileSummary, requireProfile } from "#src/config/profiles.js";
import { createLocalContext } from "#src/context.js";

export const profileUseCommand: CommandSpec = {
  name: "use",
  group: "profile",
  authLevel: "none",
  routes: [],
  register(parent, runtime) {
    parent
      .command("use")
      .description("Make a profile the current one")
      .argument("<name>", "Profile name")
      .action(async (name, _options, command) => {
        const { output } = createLocalContext(command, runtime);
        requireProfile(
          await readConfig(runtime.configDir),
          name,
          runtime.configDir
        );
        const config = await updateConfig(runtime.configDir, (current) => ({
          ...current,
          current: name,
        }));
        const summary = profileSummary(config, name);

        output.data(
          { profile: summary },
          () => `Now using profile ${name} (${summary.apiUrl})`
        );
      });
  },
};
