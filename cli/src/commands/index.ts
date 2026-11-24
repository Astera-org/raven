import type { Runtime } from "#src/runtime.js";
import type { Command } from "@commander-js/extra-typings";
import { authLoginCommand } from "./auth/login.js";
import { authLogoutCommand } from "./auth/logout.js";
import { authStatusCommand } from "./auth/status.js";
import type { CommandGroup, CommandSpec } from "./command-spec.js";
import { orgsGetCommand } from "./orgs/get.js";
import { orgsListCommand } from "./orgs/list.js";
import { profileAddCommand } from "./profile/add.js";
import { profileListCommand } from "./profile/list.js";
import { profileRemoveCommand } from "./profile/remove.js";
import { profileUseCommand } from "./profile/use.js";
import { pubsCreateCommand } from "./pubs/create.js";
import { pubsGetCommand } from "./pubs/get.js";
import { pubsPublishCommand } from "./pubs/publish.js";
import { pubsPushCommand } from "./pubs/push.js";
import { versionCommand } from "./version.js";

export const commands: readonly CommandSpec[] = [
  versionCommand,
  profileAddCommand,
  profileListCommand,
  profileUseCommand,
  profileRemoveCommand,
  authLoginCommand,
  authLogoutCommand,
  authStatusCommand,
  orgsGetCommand,
  orgsListCommand,
  pubsCreateCommand,
  pubsPushCommand,
  pubsPublishCommand,
  pubsGetCommand,
];

const groupDescriptions: Record<CommandGroup, string> = {
  auth: "Log in to and out of servers",
  orgs: "Look up organizations",
  profile: "Manage profiles (a server plus an optional user)",
  pubs: "Create, update, publish and read publications as MyST documents",
};

export function registerCommands(program: Command, runtime: Runtime): void {
  const groups = new Map<CommandGroup, Command>();
  for (const command of commands) {
    const parent =
      command.group === undefined
        ? program
        : groupCommand(program, groups, command.group);
    command.register(parent, runtime);
  }
}

function groupCommand(
  program: Command,
  groups: Map<CommandGroup, Command>,
  group: CommandGroup
): Command {
  const existing = groups.get(group);
  if (existing !== undefined) return existing;
  const created = program.command(group).description(groupDescriptions[group]);
  groups.set(group, created);
  return created;
}
