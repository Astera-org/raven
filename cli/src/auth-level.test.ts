import { describe, expect, it } from "vitest";
import { tokenForRequest } from "./auth-level.js";
import type { ResolvedProfile } from "./config/profiles.js";
import { ExitCode } from "./errors.js";

const loggedIn: ResolvedProfile = {
  name: "local",
  apiUrl: "http://localhost:7001",
  user: "alice",
  token: "token",
  tokenSource: "store",
  sessionExpiresAt: undefined,
};
const anonymousProfile: ResolvedProfile = {
  name: "public",
  apiUrl: "https://api.thestacks.org",
  user: undefined,
  token: undefined,
  tokenSource: undefined,
  sessionExpiresAt: undefined,
};

describe("tokenForRequest", () => {
  it("never sends a token for auth level none", () => {
    expect(tokenForRequest("none", loggedIn, false)).toBeUndefined();
  });

  it("sends the token when available for auth level optional", () => {
    expect(tokenForRequest("optional", loggedIn, false)).toBe("token");
    expect(
      tokenForRequest("optional", anonymousProfile, false)
    ).toBeUndefined();
  });

  it("omits the token for optional commands with --anonymous", () => {
    expect(tokenForRequest("optional", loggedIn, true)).toBeUndefined();
  });

  it("requires a token for auth level required", () => {
    expect(tokenForRequest("required", loggedIn, false)).toBe("token");
    expect(() => tokenForRequest("required", anonymousProfile, false)).toThrow(
      expect.objectContaining({
        exitCode: ExitCode.Auth,
        message:
          "this command needs a login; run raven auth login --profile public",
      })
    );
  });

  it("rejects --anonymous for required commands", () => {
    expect(() => tokenForRequest("required", loggedIn, true)).toThrow(
      expect.objectContaining({ exitCode: ExitCode.Usage })
    );
  });
});
