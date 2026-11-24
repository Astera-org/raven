import { AuthClient } from "#src/api/auth-client.js";
import type { CommandSpec } from "#src/commands/command-spec.js";
import { resolveProfile } from "#src/config/profiles.js";
import { createLocalContext } from "#src/context.js";
import { formatFields } from "#src/output.js";
import { rejectedTokenError, saveSessionExpiry } from "#src/session.js";

export const authStatusCommand: CommandSpec = {
  name: "status",
  group: "auth",
  authLevel: "optional",
  routes: [],
  register(parent, runtime) {
    parent
      .command("status")
      .description("Show the profile, server and user commands will use")
      .addHelpText(
        "after",
        "\nExits with code 3 if the stored session has expired or was revoked."
      )
      .action(async (_options, command) => {
        const { options, output } = createLocalContext(command, runtime);
        const profile = await resolveProfile(options, runtime);
        const base = {
          profile: profile.name ?? null,
          server: profile.apiUrl,
        };
        const baseFields: Array<[string, string]> = [
          ["Profile", profile.name ?? "(none)"],
          ["Server", profile.apiUrl],
        ];

        const token = options.anonymous ? undefined : profile.token;
        if (token === undefined) {
          output.data({ ...base, user: null, loggedIn: false }, () =>
            formatFields([...baseFields, ["User", "anonymous"]])
          );
          return;
        }

        const session = await new AuthClient(
          profile.apiUrl,
          runtime.authFetch
        ).getSession(token);
        if (session === undefined) {
          output.data(
            { ...base, user: profile.user ?? null, loggedIn: false },
            () =>
              formatFields([
                ...baseFields,
                [
                  "User",
                  profile.tokenSource === "env"
                    ? "(RAVEN_TOKEN rejected)"
                    : `${profile.user ?? "unknown"} (session expired)`,
                ],
              ])
          );
          throw rejectedTokenError(profile);
        }

        if (profile.name !== undefined && profile.tokenSource === "store") {
          await saveSessionExpiry(runtime, profile.name, session.expiresAt);
        }
        output.data(
          {
            ...base,
            user: session.user,
            loggedIn: true,
            sessionExpiresAt: session.expiresAt,
          },
          () =>
            formatFields([
              ...baseFields,
              ["User", session.user],
              ["Expires", session.expiresAt],
            ])
        );
      });
  },
};
