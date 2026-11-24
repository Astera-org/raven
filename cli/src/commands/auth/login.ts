import { AuthClient } from "#src/api/auth-client.js";
import { promptForHostname } from "#src/api/prompt-for-hostname.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { readConfig, updateConfig } from "#src/config/config-file.js";
import { profileSummary, withProfile } from "#src/config/profiles.js";
import { createLocalContext } from "#src/context.js";
import { CliError, ExitCode } from "#src/errors.js";
import { isInteractive, type Runtime } from "#src/runtime.js";
import { ulid } from "ulid";
import { chooseLoginTarget } from "./login-profile.js";

function formatUserCode(code: string) {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

export const authLoginCommand: CommandSpec = {
  name: "login",
  group: "auth",
  authLevel: "none",
  routes: [],
  register(parent, runtime) {
    parent
      .command("login")
      .description(
        "Log in to a server in the browser, or with a username or email and password"
      )
      .argument("[api-url]", "Server to log in to")
      .option(
        "--username <name>",
        "Log in with a password as this username or email (defaults to the profile's user)"
      )
      .option(
        "--password-stdin",
        "Log in with a password, reading it from stdin"
      )
      .addHelpText(
        "after",
        [
          "",
          "At a terminal, without --username or --password-stdin, it opens the",
          "browser to approve the login with a one-time code. Without a terminal,",
          "it logs in with a password.",
          "",
          "The profile is --profile <name>, the one profile for <api-url> (created",
          "and named after its host if there is none), or RAVEN_PROFILE, then current.",
          "After logging in, that profile becomes the current one.",
          "",
          "Examples:",
          "  raven auth login http://localhost:7001",
          "  raven auth login --profile staging",
          '  echo "$PASSWORD" | raven auth login --profile ci --username bot --password-stdin',
        ].join("\n")
      )
      .action(async (apiUrlArg, options, command) => {
        const { options: globals, output } = createLocalContext(
          command,
          runtime
        );
        const config = await readConfig(runtime.configDir);
        const {
          name: profileName,
          apiUrl,
          identifiers,
        } = await chooseLoginTarget(
          globals.profile,
          apiUrlArg,
          config,
          runtime
        );

        // Scripts get no computer name rather than one picked without asking.
        const hostname =
          identifiers.hostname ||
          (isInteractive(runtime)
            ? await promptForHostname(runtime.prompter)
            : undefined);
        const id = identifiers.id ?? ulid();

        const authClient = new AuthClient(apiUrl, runtime.authFetch);
        let token: string;

        // Without a terminal, nobody can approve in a browser, so the password
        // path's usage errors are more useful than a 10-minute wait.
        if (
          options.username !== undefined ||
          options.passwordStdin === true ||
          !isInteractive(runtime)
        ) {
          const identifier = await readIdentifier(
            options.username,
            config.profiles[profileName]?.user,
            runtime
          );
          const password = await readPassword(options.passwordStdin, runtime);

          token = await authClient.signIn(identifier, password, {
            hostname,
            profile: profileName,
            id,
          });
        } else {
          const auth = await authClient.startDeviceAuthorization();

          output.notice(
            `Open ${auth.verificationUri} and enter the code ${formatUserCode(auth.userCode)}`,
            {
              verificationUri: auth.verificationUri,
              verificationUriComplete: auth.verificationUriComplete,
              userCode: auth.userCode,
            }
          );
          await runtime.openUrl(auth.verificationUriComplete).catch(() => {
            // No browser (SSH session, container). The printed URL is enough.
          });

          token = await authClient.waitForDeviceToken(auth, {
            hostname,
            profile: profileName,
            id,
          });
        }

        const session = await authClient.getSession(token);
        if (session === undefined) {
          throw new CliError(
            `signed in to ${apiUrl}, but it returned no session`,
            ExitCode.General
          );
        }

        const previousToken = await runtime.tokenStore.get(profileName);
        await runtime.tokenStore.set(profileName, token);
        const updated = await updateConfig(runtime.configDir, (current) => ({
          ...withProfile(current, profileName, {
            apiUrl,
            user: session.user,
            sessionExpiresAt: session.expiresAt,
            hostname,
            id,
          }),
          current: profileName,
        }));
        if (previousToken !== undefined && previousToken !== token) {
          await authClient
            .signOut(previousToken)
            .catch((error: unknown) =>
              output.warn(
                `couldn't end the previous session on the server (${(error as Error).message})`
              )
            );
        }

        output.data(
          {
            profile: profileSummary(updated, profileName),
            sessionExpiresAt: session.expiresAt,
          },
          () =>
            `Logged in to ${apiUrl} as ${session.user} (profile ${profileName})`
        );
      });
  },
};

async function readIdentifier(
  option: string | undefined,
  profileUser: string | undefined,
  runtime: Runtime
): Promise<string> {
  if (option !== undefined) return option;
  if (!isInteractive(runtime)) {
    if (profileUser !== undefined) return profileUser;
    throw new CliError(
      "missing --username; pass a username or email",
      ExitCode.Usage
    );
  }
  return runtime.prompter.text({
    message: "Username or email",
    defaultValue: profileUser,
  });
}

async function readPassword(
  fromStdin: boolean | undefined,
  runtime: Runtime
): Promise<string> {
  if (fromStdin === true) {
    const password = (await runtime.stdin.readAll()).replace(/\r?\n$/, "");
    if (password === "") {
      throw new CliError("no password on stdin", ExitCode.Usage);
    }
    return password;
  }
  if (!isInteractive(runtime)) {
    throw new CliError(
      "no terminal to ask for a password; pass --password-stdin",
      ExitCode.Usage
    );
  }
  return runtime.prompter.password({ message: "Password" });
}
