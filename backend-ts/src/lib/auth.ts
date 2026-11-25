import { getConfig } from "#src/config.js";
import { getDb } from "#src/db/index.js";
import * as schema from "#src/db/schema.js";
import { verifyPassword } from "#src/lib/utils/hashing.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import {
  betterAuth,
  type BetterAuthOptions,
  type DBAdapter,
  type OAuth2Tokens,
} from "better-auth";
import {
  drizzleAdapter,
  type DrizzleAdapterConfig,
} from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  hashPassword as baHashPassword,
  verifyPassword as baVerifyPassword,
} from "better-auth/crypto";
import {
  bearer,
  captcha,
  customSession,
  deviceAuthorization,
  genericOAuth,
  openAPI,
  username,
} from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { resolveAdminUiPermissions } from "./admin-ui-session.js";
import { sendResetPasswordEmail, sendVerificationEmail } from "./mail.js";
import { sessionElevation } from "./session-elevation.js";

export type AuthInstance = ReturnType<typeof generateAuth>;
export type AuthSession = AuthInstance["$Infer"]["Session"];
export type HandlerAuthInstance = ReturnType<typeof generateHandlerAuth>;

let _auth: AuthInstance | null = null;
let _handlerAuth: HandlerAuthInstance | null = null;

function esc(v: string): string {
  return v.replace(/'/g, "''");
}

const {
  users: user,
  accounts: account,
  sessions: session,
  verifications: verification,
  ...remainingSchema
} = schema;

export const drizzleAdapterConfig: DrizzleAdapterConfig = {
  provider: "mysql",
  schema: {
    user,
    account,
    session,
    verification,
    ...remainingSchema,
  },
};

// Keep in sync with the frontend's validation username rules.
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 18;
const USERNAME_ALLOWED_CHARS_REGEX = /^[a-zA-Z0-9._-]+$/;
const USERNAME_NO_LEADING_TRAILING_OR_CONSECUTIVE_SPECIAL_CHARS_REGEX =
  /^[a-zA-Z0-9]([._-]?[a-zA-Z0-9])*$/;
export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_ALLOWED_CHARS_REGEX.test(username) &&
    USERNAME_NO_LEADING_TRAILING_OR_CONSECUTIVE_SPECIAL_CHARS_REGEX.test(
      username
    )
  );
}

/**
 * better-auth redirects to `callbackURL` once the email is verified and
 * defaults it to "/", which resolves against the API's origin. When the
 * client didn't choose a page, send users to the web app's login page, since
 * verifying doesn't sign them in.
 */
export function withWebCallbackURL(url: string, webBaseURL: string): string {
  const parsed = new URL(url);
  if (!webBaseURL || parsed.searchParams.get("callbackURL") !== "/") {
    return url;
  }
  parsed.searchParams.set("callbackURL", `${webBaseURL}/login?verified=true`);
  return parsed.toString();
}

/**
 * Only sign-up is protected: the `raven` CLI signs in through
 * `/sign-in/email` and cannot show a Turnstile widget.
 */
export function signUpCaptchaPlugins(turnstileSecretKey: string) {
  if (!turnstileSecretKey) return [];
  return [
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: turnstileSecretKey,
      endpoints: ["/sign-up/email"],
    }),
  ];
}

/**
 * This is in a function because the initConfig and initDb functions are async and the
 * betterAuth instance needs to be created after those are done.
 * @returns {AuthInstance}
 */
export function getAuth(): AuthInstance {
  if (_auth) return _auth;

  _auth = generateAuth();
  return _auth;
}

/**
 * The build behind the `/api/auth2` HTTP handler, whose `/get-session` adds
 * the admin UI's permissions. `customSession` replaces the `getSession`
 * endpoint itself, so `authMiddleware` keeps reading sessions through
 * `getAuth()`: on this build every request would run its callback, and its
 * endpoint turns session lookup errors into "no session".
 */
export function getHandlerAuth(): HandlerAuthInstance {
  if (_handlerAuth) return _handlerAuth;

  _handlerAuth = generateHandlerAuth();
  return _handlerAuth;
}

/**
 * Builds a fresh `betterAuth` instance. Used by `auth.generate-config.ts`
 * in the context of the `better-auth` CLI to generate the drizzle schema.
 */
export function generateAuth(
  stubDbAdapter?: (options: BetterAuthOptions) => DBAdapter
) {
  return betterAuth(buildAuthOptions(stubDbAdapter));
}

function generateHandlerAuth() {
  const options = buildAuthOptions();
  return betterAuth({
    ...options,
    plugins: [
      ...options.plugins,
      customSession(
        async ({ user, session }, ctx) => ({
          session,
          user: {
            ...user,
            ...(await resolveAdminUiPermissions(ctx.headers, user.id)),
          },
        }),
        options
      ),
    ],
  });
}

function buildAuthOptions(
  stubDbAdapter?: (options: BetterAuthOptions) => DBAdapter
) {
  const cfg = getConfig();

  // Allow additional origins via config.
  // Pattern is configurable via EXTRA_ALLOWED_ORIGIN_PATTERN in the raven.toml.
  const trustedOrigins = cfg.BASE_URL_WEB ? [cfg.BASE_URL_WEB] : [];

  if (cfg.BASE_URL_ADMIN) {
    trustedOrigins.push(cfg.BASE_URL_ADMIN);
  }

  if (cfg.EXTRA_ALLOWED_ORIGIN_PATTERN) {
    const patterns = cfg.EXTRA_ALLOWED_ORIGIN_PATTERN.split(",").map((s) =>
      s.trim()
    );
    trustedOrigins.push(...patterns);
  }

  const orcidRedirectUriBase = cfg.ORCID_REDIRECT_URI_BASE || cfg.BASE_URL_WEB;

  return {
    baseURL: cfg.BASE_URL_API.replace(/\/api$/, ""),
    basePath: "/api/auth2",
    rateLimit: { enabled: cfg.ENVIRONMENT === "production" },
    plugins: [
      bearer(),
      // The docs page is served by `apiDocs` in app.ts; this plugin only
      // provides the schema at /open-api/generate-schema.
      openAPI({ disableDefaultReference: true }),
      username({
        minUsernameLength: USERNAME_MIN_LENGTH,
        maxUsernameLength: USERNAME_MAX_LENGTH,
        usernameValidator: isValidUsername,
      }),
      genericOAuth({
        config: [
          {
            providerId: "orcid",
            clientId: cfg.ORCID_CLIENT_ID,
            clientSecret: cfg.ORCID_CLIENT_SECRET,
            discoveryUrl: cfg.ORCID_USE_SANDBOX
              ? "https://sandbox.orcid.org/.well-known/openid-configuration"
              : "https://orcid.org/.well-known/openid-configuration",
            redirectURI: `${orcidRedirectUriBase}/api/auth2/oauth2/callback/orcid`,
            scopes: ["/authenticate"],
            pkce: true,
            getUserInfo: async (tokens: OAuth2Tokens) => {
              // ORCID's token response includes orcid id, name directly —
              // no separate userinfo endpoint like standard OIDC.
              // tokens.raw has the full token payload (orcid, name, etc.)
              const orcidId = tokens.raw?.orcid as string;
              const name = tokens.raw?.name as string;
              return {
                id: orcidId,
                name: name ?? orcidId,
                email: `${orcidId}@orcid.placeholder`, // ORCID doesn't provide email by default
                emailVerified: false,
              };
            },
          },
        ],
      }),
      deviceAuthorization({
        verificationUri: `${cfg.BASE_URL_WEB}${cfg.DEVICE_VERIFICATION_PATH}`,
        schema: { deviceCode: { modelName: "deviceCodes" } },
        validateClient: (id) => id === "stacks-cli",
        expiresIn: "10m",
      }),
      sessionElevation({
        maxAgeSec: cfg.SESSION_ELEVATION_MAX_AGE_SEC,
        upsertElevation: (sessionId, expiresAt) =>
          makeRepositories().sessions.upsertElevation(sessionId, expiresAt),
      }),
      ...signUpCaptchaPlugins(cfg.TURNSTILE_SECRET_KEY),
    ],

    /**
     * As seen in the `getFields` of better auth's `db/schema.ts`, the plugin fields
     * are implemented after the `additionalFields` so there is not a way currently
     * to enforce `username` to be `NOT NULL`, since the username plugin make it
     * nullable.
     *
     * Therefore, we need to programatically check here that on signup the username
     * must be specified, otherwise there is a `MISSING_FIELD` error.
     *
     * See: https://github.com/better-auth/better-auth/blob/3d0efa308d575c4aa184d65deaf29f2626add8fd/packages/better-auth/src/db/schema.ts#L52
     */
    hooks: {
      // Since
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;

        if (
          typeof ctx.body?.username !== "string" ||
          !ctx.body.username.trim()
        ) {
          throw new APIError("BAD_REQUEST", {
            code: "MISSING_FIELD",
            message: "username is required",
          });
        }
      }),
    },

    // This is for Drizzle, see the Docs: https://better-auth.com/docs/adapters/drizzle
    experimental: { joins: true },
    advanced: {
      database: {
        generateId: () => ulid(),
      },
      defaultCookieAttributes: {
        sameSite: cfg.SERVER_DEBUG ? "lax" : ("none" as const),
        secure: !cfg.SERVER_DEBUG,
      },
    },

    user: {
      additionalFields: {
        username: {
          type: "string",
          unique: true,
          required: true,
          input: true,
        },
        firstName: {
          type: "string",
          required: true,
        },
        lastName: {
          type: "string",
          required: true,
        },
        profile: {
          type: "string",
          required: false,
        },
        idInt: {
          type: "number",
          required: false,
          input: false,
          index: true,
          returned: true,
        },
        orcid: {
          type: "string",
          required: false,
          input: false,
        },
        approved: {
          type: "boolean",
          required: true,
          input: false,
          defaultValue: () => false,
        },
        state: {
          type: "string",
          required: true,
          input: false,
          defaultValue: () => "ACTIVE",
        },
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: cfg.REQUIRE_EMAIL_VERIFICATION,
      password: {
        // Support legacy Werkzeug hashes (scrypt:...) alongside better-auth's own hash
        // format, so existing users don't need password resets.
        hash: (password: string) => baHashPassword(password),
        verify: async ({ hash, password }) => {
          if (hash.startsWith("scrypt:") || hash.startsWith("pbkdf2:")) {
            const valid = await verifyPassword(password, hash);

            // Lazily upgrade to better-auth's hash format on successful login.
            if (valid) {
              const newHash = await baHashPassword(password);
              await getDb().execute(
                sql`UPDATE accounts SET password = ${newHash} WHERE password = ${esc(hash)} AND provider_id = 'credential'`
              );
            }
            return valid;
          }
          return baVerifyPassword({ hash, password });
        },
      },
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail(user, url);
      },
    },

    emailVerification: {
      sendOnSignUp: cfg.REQUIRE_EMAIL_VERIFICATION,
      // Lets users who lost the email get a new link by trying to sign in.
      sendOnSignIn: cfg.REQUIRE_EMAIL_VERIFICATION,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail(
          user,
          withWebCallbackURL(url, cfg.BASE_URL_WEB)
        );
      },
    },
    secret: cfg.BETTER_AUTH_SECRET,
    trustedOrigins,

    database: stubDbAdapter ?? drizzleAdapter(getDb(), drizzleAdapterConfig),

    socialProviders: {
      google: {
        clientId: cfg.GOOGLE_CLIENT_ID,
        clientSecret: cfg.GOOGLE_CLIENT_SECRET,
      },
    },

    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "orcid"],
        allowDifferentEmails: true,
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await getDb()
              .update(schema.users)
              .set({ loginAt: sql`CURRENT_TIMESTAMP(3)` })
              .where(eq(schema.users.id, session.userId));
          },
        },
      },
      account: {
        create: {
          after: async (account) => {
            if (account.providerId === "orcid") {
              await getDb()
                .update(schema.users)
                .set({ orcid: account.accountId })
                .where(eq(schema.users.id, account.userId));
            }
          },
        },
        update: {
          after: async (account) => {
            // Keep the legacy `users.password` column in sync so the
            // JWT-based /api/auth/login route still works after a
            // password change/reset through better-auth.
            if (account.providerId === "credential" && account.password) {
              await getDb()
                .update(schema.users)
                .set({ password: account.password })
                .where(eq(schema.users.id, account.userId));
            }
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}
