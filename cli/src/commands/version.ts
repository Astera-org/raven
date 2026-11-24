import { unwrap } from "#src/api/client.js";
import { createContext } from "#src/context.js";
import { formatFields } from "#src/output.js";
import { CLI_VERSION } from "#src/version.js";
import type { CommandSpec } from "./command-spec.js";

export const versionCommand: CommandSpec = {
  name: "version",
  authLevel: "none",
  routes: [{ method: "get", path: "/health" }],
  register(program, runtime) {
    program
      .command("version")
      .description(
        "Show the CLI version and the version of the server it talks to"
      )
      .addHelpText(
        "after",
        [
          "",
          "Examples:",
          "  raven version",
          "  raven version --profile staging --json",
        ].join("\n")
      )
      .action(async (_options, command) => {
        const { output, profile, api } = await createContext(
          command,
          versionCommand.authLevel,
          runtime
        );
        const cli = { name: "raven", version: CLI_VERSION };
        const cliFields: Array<[string, string]> = [
          ["CLI", `raven ${CLI_VERSION}`],
          ["Server", profile.apiUrl],
        ];

        let health;
        try {
          health = await unwrap(profile.apiUrl, () => api.GET("/health"));
        } catch (error) {
          output.data({ cli, server: { url: profile.apiUrl } }, () =>
            formatFields(cliFields)
          );
          throw error;
        }

        output.data({ cli, server: { url: profile.apiUrl, ...health } }, () =>
          formatFields([...cliFields, ["API", `v${health.apiVersion}`]])
        );
      });
  },
};
