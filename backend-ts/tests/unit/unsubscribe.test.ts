import { describe, expect, it, vi } from "vitest";

// Expected tokens were produced by the original Python generator
// (`_generate_unsubscribe_token` in the removed mail_utils.py). Links already
// emailed carry tokens in this exact format, so these values must not change.
const SECRET = "unsubscribe-token-test-secret";
const TYPE = "NEW_COMMENT__BYLINE_CONTRIB";
const ASCII_EMAIL = "ada@example.com";
const ASCII_TOKEN =
  "eyJlbWFpbCI6ImFkYUBleGFtcGxlLmNvbSIsInR5cGUiOiJORVdfQ09NTUVOVF9fQllMSU5FX0NPTlRSSUIifQ.ofI0JnWitz2VyNRWYxnYOytWsytWJWaenDTnDuIv3l8";
// Python's json.dumps escapes non-ASCII ("zoë"), unlike JSON.stringify.
const NON_ASCII_EMAIL = "zoë@example.com";
const PYTHON_NON_ASCII_TOKEN =
  "eyJlbWFpbCI6InpvXHUwMGViQGV4YW1wbGUuY29tIiwidHlwZSI6Ik5FV19DT01NRU5UX19CWUxJTkVfQ09OVFJJQiJ9.z6MnT-p6F8XYwkX2MyC2WnvxNBS63XPgwAobC7aSha4";

vi.mock("#src/config.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConfig: () => ({ JWT_SECRET_KEY: SECRET }),
}));

const { decodeUnsubscribeToken, generateUnsubscribeToken } =
  await import("#src/lib/unsubscribe.js");

describe("generateUnsubscribeToken", () => {
  it("produces the established token format", () => {
    expect(generateUnsubscribeToken(ASCII_EMAIL, TYPE)).toBe(ASCII_TOKEN);
  });

  it("round-trips through decodeUnsubscribeToken", () => {
    const token = generateUnsubscribeToken(NON_ASCII_EMAIL, TYPE);
    expect(decodeUnsubscribeToken(token)).toEqual({
      email: NON_ASCII_EMAIL,
      type: TYPE,
    });
  });
});

describe("decodeUnsubscribeToken", () => {
  it("decodes a previously issued token", () => {
    expect(decodeUnsubscribeToken(ASCII_TOKEN)).toEqual({
      email: ASCII_EMAIL,
      type: TYPE,
    });
  });

  it("decodes a previously issued token with a non-ASCII email", () => {
    expect(decodeUnsubscribeToken(PYTHON_NON_ASCII_TOKEN)).toEqual({
      email: NON_ASCII_EMAIL,
      type: TYPE,
    });
  });

  it("rejects a token whose payload was tampered with", () => {
    const [, mac] = ASCII_TOKEN.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ email: "mallory@example.com", type: TYPE })
    ).toString("base64url");
    expect(decodeUnsubscribeToken(`${forgedPayload}.${mac}`)).toBeNull();
  });

  it("rejects a token without a separator", () => {
    expect(decodeUnsubscribeToken("not-a-token")).toBeNull();
  });
});
