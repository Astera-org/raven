import { withWebCallbackURL } from "#src/lib/auth.js";
import { describe, expect, it } from "vitest";

const VERIFY_URL = "https://api.example.com/api/auth2/verify-email?token=abc";

describe("withWebCallbackURL", () => {
  it("points the default callback at the web app's login page", () => {
    const url = withWebCallbackURL(
      `${VERIFY_URL}&callbackURL=%2F`,
      "https://example.com"
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("callbackURL")).toBe(
      "https://example.com/login?verified=true"
    );
    expect(parsed.searchParams.get("token")).toBe("abc");
  });

  it("keeps a callback the client chose", () => {
    const url = `${VERIFY_URL}&callbackURL=${encodeURIComponent("https://example.com/welcome")}`;
    expect(withWebCallbackURL(url, "https://example.com")).toBe(url);
  });

  it("leaves the URL alone when no web app is configured", () => {
    const url = `${VERIFY_URL}&callbackURL=%2F`;
    expect(withWebCallbackURL(url, "")).toBe(url);
  });
});
