import { type BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import { z } from "zod";

const ELEVATE_SESSION_PATH = "/elevate-session";

/**
 * Step-up auth: `POST /elevate-session` re-checks the caller's password and
 * marks their session as elevated for `maxAgeSec`. Routes built with
 * `createAuthedRoute(..., { requireElevated: true })` require that mark.
 *
 * `upsertElevation` must create or extend the session's row atomically: the
 * better-auth adapter has no upsert, and a delete-then-create lets concurrent
 * confirmations collide on the unique `sessionId`.
 */
export function sessionElevation({
  maxAgeSec,
  upsertElevation,
}: {
  maxAgeSec: number;
  upsertElevation: (sessionId: string, expiresAt: Date) => Promise<void>;
}) {
  return {
    id: "session-elevation",
    schema: {
      sessionElevation: {
        modelName: "sessionElevations",
        fields: {
          sessionId: {
            type: "string",
            required: true,
            unique: true,
            references: { model: "session", field: "id", onDelete: "cascade" },
          },
          expiresAt: { type: "date", required: true },
          createdAt: { type: "date", required: true },
        },
      },
    },
    endpoints: {
      elevateSession: createAuthEndpoint(
        ELEVATE_SESSION_PATH,
        {
          method: "POST",
          body: z.object({ password: z.string() }),
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          const credential = (
            await ctx.context.internalAdapter.findAccounts(user.id)
          ).find((account) => account.providerId === "credential");
          const valid =
            !!credential?.password &&
            (await ctx.context.password.verify({
              hash: credential.password,
              password: ctx.body.password,
            }));
          if (!valid) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_PASSWORD",
              message: "Invalid password",
            });
          }

          const expiresAt = new Date(Date.now() + maxAgeSec * 1000);
          await upsertElevation(session.id, expiresAt);
          return ctx.json({ expiresAt: expiresAt.toISOString() });
        }
      ),
    },
    // Only applies where better-auth's rate limiting is on (production).
    rateLimit: [
      {
        pathMatcher: (path) => path === ELEVATE_SESSION_PATH,
        window: 60,
        max: 5,
      },
    ],
  } satisfies BetterAuthPlugin;
}
