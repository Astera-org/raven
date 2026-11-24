import type { PlainFetch, PlainRequestInit } from "#src/api/plain-fetch.js";
import { jsonResponse } from "./test-runtime.js";

export type DeviceTokenReply =
  | "approved"
  | "authorization_pending"
  | "access_denied"
  | "expired_token";

export interface AuthCall {
  url: string;
  path: string;
  body: unknown;
  authorization: string | null;
  userAgent: string | null;
}

/**
 * An in-memory stand-in for BetterAuth's `/api/auth2` endpoints with one
 * account, for tests of the auth commands.
 */
export class FakeAuthServer {
  readonly calls: AuthCall[] = [];
  readonly sessions = new Map<string, string>();
  expiresAt = "2026-09-30T12:00:00.000Z";
  unreachable = false;
  readonly userCode = "ABCDEFGH";
  verificationUri = "https://thestacks.org/device";
  deviceExpiresIn = 600;
  /** Replies to successive `/device/token` polls, in order. */
  deviceTokenReplies: DeviceTokenReply[] = [
    "authorization_pending",
    "approved",
  ];
  private issued = 0;

  constructor(
    private readonly account = {
      id: "01KX0000000000000000000USR",
      username: "alice",
      email: "alice@example.org",
      password: "secret",
    }
  ) {}

  readonly fetch: PlainFetch = async (url, init) => {
    if (this.unreachable) {
      throw Object.assign(new AggregateError([], ""), {
        code: "ECONNREFUSED",
      });
    }
    const call = this.record(url, init);
    const token = call.authorization?.replace(/^Bearer /, "");

    switch (call.path) {
      case "/sign-in/username":
      case "/sign-in/email":
        return this.signIn(call.body as Record<string, string>);
      case "/get-session":
        return this.getSession(token);
      case "/device/code":
        return this.deviceCode();
      case "/device/token":
        return this.deviceToken();
      case "/sign-out":
        if (token !== undefined) this.sessions.delete(token);
        return jsonResponse({ success: true });
      default:
        return jsonResponse({ message: "Not found" }, 404);
    }
  };

  /** Starts a session directly, as if the user had logged in earlier. */
  issueToken(): string {
    const token = `token-${++this.issued}`;
    this.sessions.set(token, this.account.username);
    return token;
  }

  private signIn(body: Record<string, string>): Response {
    const identifier = body.username ?? body.email;
    const knownIdentifier =
      identifier === this.account.username || identifier === this.account.email;
    if (!knownIdentifier || body.password !== this.account.password) {
      return jsonResponse(
        {
          code: "INVALID_USERNAME_OR_PASSWORD",
          message: "Invalid username or password",
        },
        401
      );
    }
    return jsonResponse({ redirect: false, token: this.issueToken() });
  }

  private deviceCode(): Response {
    return jsonResponse({
      device_code: "device-code",
      user_code: this.userCode,
      verification_uri: this.verificationUri,
      verification_uri_complete: `${this.verificationUri}?user_code=${this.userCode}`,
      expires_in: this.deviceExpiresIn,
      interval: 0,
    });
  }

  private deviceToken(): Response {
    const reply = this.deviceTokenReplies.shift() ?? "expired_token";
    if (reply === "approved") {
      return jsonResponse({ access_token: this.issueToken() });
    }
    return jsonResponse({ error: reply }, 400);
  }

  private getSession(token: string | undefined): Response {
    if (token === undefined || !this.sessions.has(token)) {
      return jsonResponse(null);
    }
    return jsonResponse({
      session: { expiresAt: this.expiresAt },
      user: {
        id: this.account.id,
        username: this.account.username,
        email: this.account.email,
      },
    });
  }

  private record(url: string, init: PlainRequestInit): AuthCall {
    const call = {
      url,
      path: new URL(url).pathname.replace(/^\/api\/auth2/, ""),
      body: init.body === undefined ? undefined : JSON.parse(init.body),
      authorization: init.headers.get("Authorization"),
      userAgent: init.headers.get("User-Agent"),
    };
    this.calls.push(call);
    return call;
  }
}
