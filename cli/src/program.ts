import { Command, CommanderError } from "@commander-js/extra-typings";
import { registerCommands } from "./commands/index.js";
import { createOutput, readGlobalOptions } from "./context.js";
import { CliError, ExitCode } from "./errors.js";
import type { Runtime } from "./runtime.js";
import { CLI_VERSION } from "./version.js";

export function createProgram(runtime: Runtime): Command {
  const program = new Command()
    .name("raven")
    .description("Command-line interface for the Raven backend")
    .version(CLI_VERSION, "-V, --version", "Print the CLI version")
    .option(
      "--profile <name>",
      "Profile to use (default: RAVEN_PROFILE, then current)"
    )
    .option("--json", "Print machine-readable JSON")
    .option("--anonymous", "Send requests without a token")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => runtime.stdout.write(text),
      writeErr: (text) => runtime.stderr.write(text),
    });

  registerCommands(program, runtime);
  return program;
}

/** Runs the CLI and returns the process exit code. */
export async function runCli(
  argv: readonly string[],
  runtime: Runtime
): Promise<ExitCode> {
  const program = createProgram(runtime);
  try {
    await program.parseAsync(argv, { from: "user" });
    return ExitCode.Success;
  } catch (error) {
    // Commander has already printed its own usage and help messages.
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? ExitCode.Success : ExitCode.Usage;
    }

    const cliError =
      error instanceof CliError
        ? error
        : new CliError(
            error instanceof Error ? error.message : String(error),
            ExitCode.General
          );
    createOutput(readGlobalOptions(program), runtime).error(cliError);
    return cliError.exitCode;
  }
}
