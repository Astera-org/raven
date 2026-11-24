import spec from "#src/api/openapi.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import type { ApiRoute } from "./command-spec.js";
import { commands } from "./index.js";

type Operation = { security?: unknown[] };
const paths = spec.paths as Record<string, Record<string, Operation>>;

function requiresAuth(route: ApiRoute): boolean {
  return (paths[route.path]?.[route.method]?.security?.length ?? 0) > 0;
}

describe("command auth levels", () => {
  const routes = commands.flatMap((command) =>
    command.routes.map((route) => ({ command, route }))
  );

  it.each(routes)(
    "$command.name calls $route.method $route.path, which is in the spec",
    ({ route }) => {
      expect(
        paths[route.path]?.[route.method],
        "route is missing from the v1 spec"
      ).toBeDefined();
    }
  );

  // A command that needs a login may also call routes where login is
  // optional; it sends its token there too. Only a route that needs a login
  // forces the command to need one, unless an option alone calls it.
  it.each(commands.filter((command) => command.routes.length > 0))(
    "$name needs a login exactly when one of its routes does",
    (command) => {
      const anyRouteRequiresAuth = command.routes.some(
        (route) => requiresAuth(route) && route.loginOption === undefined
      );
      expect(command.authLevel === "required").toBe(anyRouteRequiresAuth);
    }
  );

  it.each(routes.filter(({ route }) => route.loginOption !== undefined))(
    "$command.name calls $route.method $route.path only with $route.loginOption, which needs a login",
    ({ command, route }) => {
      expect(requiresAuth(route)).toBe(true);
      expect(command.authLevel).toBe("optional");
    }
  );
});
