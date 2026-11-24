import { apiError, CliError, ExitCode, networkError } from "#src/errors.js";
import { CLI_VERSION } from "#src/version.js";
import { arch, platform, release } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { REQUEST_TIMEOUT_MS } from "./client.js";
import type { PlainFetch } from "./plain-fetch.js";

const SignInResponseSchema = z.object({ token: z.string().min(1) });

const SessionResponseSchema = z
  .object({
    session: z.object({ expiresAt: z.string() }),
    user: z.object({
      id: z.string(),
      email: z.string(),
      username: z.string().nullish(),
    }),
  })
  .nullable();

export interface SessionInfo {
  expiresAt: string;
  /** The username when the account has one, otherwise the email. */
  user: string;
  userId: string;
}

interface Identifiers {
  id: string;
  hostname?: string | null;
  profile: string;
}

const DEVICE_CLIENT_ID = "stacks-cli";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/**
 * BetterAuth stores the User-Agent of the request that creates a session, so
 * this labels the device in the user's session list.
 */
export const USER_AGENT_PREFIX = `stacks-cli/${CLI_VERSION}`;
export const USER_AGENT_DETAILS = `${platform()} ${release()}; ${arch()}; node/${process.versions.node}`;

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The CLI opens this URL in a browser, so only https, or http for a local dev server. */
const BrowserUrlSchema = z.url({ protocol: /^https?$/ }).refine(
  (value) => {
    const url = new URL(value);
    return url.protocol === "https:" || LOOPBACK_HOSTNAMES.has(url.hostname);
  },
  { message: "Only a localhost URL may use http" }
);

const DeviceCodeResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: BrowserUrlSchema,
  verification_uri_complete: BrowserUrlSchema.optional(),
  expires_in: z.number(),
  interval: z.number().default(5),
});

const DeviceTokenSuccessSchema = z.object({ access_token: z.string().min(1) });
const DeviceTokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Includes the code, so the user doesn't have to type it. */
  verificationUriComplete: string;
  expiresAt: number;
  intervalSeconds: number;
}

/**
 * The BetterAuth endpoints under `/api/auth2` that the CLI needs. They sit
 * outside `/api/v1`, so they aren't in the generated OpenAPI client.
 */
export class AuthClient {
  constructor(
    private readonly apiUrl: string,
    private readonly fetch: PlainFetch
  ) {}

  /** Signs in with an email (if it contains `@`) or a username. */
  async signIn(
    identifier: string,
    password: string,
    identifiers?: Identifiers
  ): Promise<string> {
    const [path, body] = identifier.includes("@")
      ? ["/sign-in/email", { email: identifier, password }]
      : ["/sign-in/username", { username: identifier, password }];
    const response = await this.request(path, {
      method: "POST",
      body,
      identifiers,
    });
    return SignInResponseSchema.parse(response).token;
  }

  /** Returns undefined when the token no longer has a session. */
  async getSession(token: string): Promise<SessionInfo | undefined> {
    const response = SessionResponseSchema.parse(
      await this.request("/get-session", { method: "GET", token })
    );
    if (response === null) return undefined;
    return {
      expiresAt: response.session.expiresAt,
      user: response.user.username ?? response.user.email,
      userId: response.user.id,
    };
  }

  async signOut(token: string): Promise<void> {
    await this.request("/sign-out", { method: "POST", body: {}, token });
  }

  private async request(
    path: string,
    options: {
      method: "GET" | "POST";
      body?: unknown;
      token?: string;
      identifiers?: Identifiers;
    }
  ): Promise<unknown> {
    const { ok, status, body } = await this.send(path, options);
    if (!ok) throw apiError(status, body);
    return body;
  }

  private async send(
    path: string,
    options: {
      method: "GET" | "POST";
      body?: unknown;
      token?: string;
      identifiers?: Identifiers;
    }
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    const { identifiers } = options;
    // Encoded so headers stay ASCII and the server can parse values with `;` or `)`.
    const hostClause = identifiers?.hostname
      ? `; host=${encodeURIComponent(identifiers.hostname)}`
      : "";
    const idAndProfileClause = identifiers
      ? `; id=${encodeURIComponent(identifiers.id)}; profile=${encodeURIComponent(identifiers.profile)}`
      : "";
    const headers = new Headers({
      "User-Agent": `${USER_AGENT_PREFIX} (${USER_AGENT_DETAILS}${idAndProfileClause}${hostClause})`,
    });
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (options.token !== undefined) {
      headers.set("Authorization", `Bearer ${options.token}`);
    }

    let response: Response;
    try {
      response = await this.fetch(`${this.apiUrl}/api/auth2${path}`, {
        method: options.method,
        headers,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw networkError(this.apiUrl, error);
    }

    const body: unknown = await response.json().catch(() => undefined);
    return { ok: response.ok, status: response.status, body };
  }

  async startDeviceAuthorization(
    identifiers?: Identifiers
  ): Promise<DeviceAuthorization> {
    const data = DeviceCodeResponseSchema.parse(
      await this.request("/device/code", {
        method: "POST",
        body: { client_id: DEVICE_CLIENT_ID },
        identifiers,
      })
    );
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete:
        data.verification_uri_complete ?? data.verification_uri,
      expiresAt: Date.now() + data.expires_in * 1000,
      intervalSeconds: data.interval,
    };
  }

  /** Polls until the user approves, then returns the session token. */
  async waitForDeviceToken(
    auth: DeviceAuthorization,
    identifiers: Identifiers
  ): Promise<string> {
    let interval = auth.intervalSeconds;

    while (Date.now() < auth.expiresAt) {
      await sleep(interval * 1000);

      const { ok, status, body } = await this.send("/device/token", {
        method: "POST",
        body: {
          grant_type: DEVICE_GRANT_TYPE,
          device_code: auth.deviceCode,
          client_id: DEVICE_CLIENT_ID,
        },
        identifiers,
      });

      if (ok) return DeviceTokenSuccessSchema.parse(body).access_token;

      const parsed = DeviceTokenErrorSchema.safeParse(body);
      if (!parsed.success) throw apiError(status, body);

      switch (parsed.data.error) {
        case "authorization_pending":
          continue;
        case "slow_down":
          interval += 5;
          continue;
        case "access_denied":
          throw new CliError("Login was denied in the browser.", ExitCode.Auth);
        case "expired_token":
          throw new CliError(
            "The login code expired. Run login again.",
            ExitCode.Auth
          );
        default:
          throw new CliError(
            parsed.data.error_description ?? parsed.data.error,
            ExitCode.Auth
          );
      }
    }

    throw new CliError(
      "The login code expired. Run login again.",
      ExitCode.Auth
    );
  }
}
