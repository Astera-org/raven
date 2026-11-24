import type { AuthLevel } from "#src/auth-level.js";
import type { Runtime } from "#src/runtime.js";
import type { Command } from "@commander-js/extra-typings";

export interface ApiRoute {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** Path relative to `/api/v1`, as written in the OpenAPI spec. */
  path: string;
  /**
   * The option that makes the command call this route, when only that option
   * does, e.g. `--draft`. A command with optional auth then needs a login.
   */
  loginOption?: string;
}

export type CommandGroup = "auth" | "orgs" | "profile" | "pubs";

export interface CommandSpec {
  name: string;
  /** Parent command, e.g. `profile` for `raven profile add`. */
  group?: CommandGroup;
  authLevel: AuthLevel;
  /** v1 routes the command calls; checked against the spec's `security`. */
  routes: readonly ApiRoute[];
  register(parent: Command, runtime: Runtime): void;
}
