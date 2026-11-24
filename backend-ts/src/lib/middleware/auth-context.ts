import { type AuthSession, getAuth } from "#src/lib/auth.js";
import { createMiddleware } from "hono/factory";

/**
 * Types for the context variables added by the auth middleware.
 */
export type MaybeAuthContext = AuthSession | { user: null; session: null };
export type AuthContext = AuthSession;

/**
 * Middleware that adds the `user` and `session` properties to the context.
 */
export const authMiddleware = createMiddleware<{ Variables: MaybeAuthContext }>(
  async (c, next) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) {
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  }
);
