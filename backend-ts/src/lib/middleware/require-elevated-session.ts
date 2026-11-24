import { type AuthEnv } from "#src/types/hono.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { createMiddleware } from "hono/factory";

export const ELEVATION_REQUIRED_MESSAGE =
  "Recent password confirmation required; POST /api/auth2/elevate-session";

/** Runs after `requireAuth`, so the session is always set. */
export const requireElevatedSession = createMiddleware<AuthEnv>(
  async (c, next) => {
    const elevated = await makeRepositories().sessions.existsActiveElevation(
      c.var.session.id
    );
    if (!elevated) {
      return c.json(
        applicationError({ auth: { message: ELEVATION_REQUIRED_MESSAGE } }),
        403
      );
    }
    await next();
  }
);

export const requireElevatedSessionResponse = {
  403: {
    description:
      "The session needs a recent password confirmation, or the caller " +
      "lacks permission",
    content: errorContent("auth"),
  },
};
