import { DEFAULT_API_URL, normalizeApiUrl } from "#src/config/profiles.js";
import { CliError, ExitCode } from "#src/errors.js";
import { isInteractive, type Runtime } from "#src/runtime.js";

/** The server from the argument, or asked for when a person is at a terminal. */
export async function apiUrlFromArgOrPrompt(
  arg: string | undefined,
  runtime: Runtime,
  missingMessage: string
): Promise<string> {
  if (arg !== undefined) return normalizeApiUrl(arg);
  if (!isInteractive(runtime)) {
    throw new CliError(missingMessage, ExitCode.Usage);
  }
  const answer = await runtime.prompter.text({
    message: "Server URL",
    defaultValue: DEFAULT_API_URL,
  });
  return normalizeApiUrl(answer);
}
