import { type AppEnv, type AuthEnv } from "#src/types/hono.js";
import {
  applicationError,
  errorContent,
} from "#v1/lib/route-responses/error-content.js";
import { createMiddleware } from "hono/factory";

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  // authMiddleware may have set these to null. AuthEnv describes the
  // state *after* this check, so read them as possibly null here.
  const { user, session } = c.var as AppEnv["Variables"];
  if (!user || !session) {
    return c.json(
      applicationError({ auth: { message: "Authentication required" } }),
      401
    );
  }
  await next();
});

export const requireAuthResponse = {
  401: {
    description: "No authenticated session",
    content: errorContent("auth"),
  },
};
