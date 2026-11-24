import { signUpCaptchaPlugins } from "#src/lib/auth.js";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, describe, expect, it, vi } from "vitest";

const FAILING_TEST_SECRET = "2x0000000000000000000000000000000AA";
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function authWithCaptcha(secretKey: string) {
  const db: Record<string, Record<string, unknown>[]> = {
    user: [],
    account: [],
    session: [],
  };
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test-secret-that-is-at-least-32-characters-long",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: signUpCaptchaPlugins(secretKey),
  });
  return { auth, db };
}

function post(
  path: string,
  body: Record<string, string>,
  headers: Record<string, string> = {}
) {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockSiteverify(success: boolean) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      Promise.resolve(
        Response.json(
          success
            ? { success: true }
            : { success: false, "error-codes": ["invalid-input-response"] }
        )
      )
    );
}

const signUpBody = {
  email: "someone@example.com",
  password: "a-long-enough-password",
  name: "Someone",
};

describe("signUpCaptchaPlugins", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds no plugin when no secret key is configured", () => {
    expect(signUpCaptchaPlugins("")).toEqual([]);
  });

  it("rejects sign-up without a captcha response", async () => {
    const { auth } = authWithCaptcha(FAILING_TEST_SECRET);
    const res = await auth.handler(post("/sign-up/email", signUpBody));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "MISSING_RESPONSE" });
  });

  it("allows sign-up with a verified captcha response", async () => {
    const fetchSpy = mockSiteverify(true);
    const { auth, db } = authWithCaptcha(FAILING_TEST_SECRET);
    const res = await auth.handler(
      post("/sign-up/email", signUpBody, { "x-captcha-response": "good" })
    );
    expect(res.status).toBe(200);
    expect(db["user"]).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(SITEVERIFY_URL);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      secret: FAILING_TEST_SECRET,
      response: "good",
    });
  });

  it("rejects sign-up with an invalid captcha response", async () => {
    mockSiteverify(false);
    const { auth, db } = authWithCaptcha(FAILING_TEST_SECRET);
    const res = await auth.handler(
      post("/sign-up/email", signUpBody, { "x-captcha-response": "bad" })
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "VERIFICATION_FAILED" });
    expect(db["user"]).toHaveLength(0);
  });

  it("allows sign-up when no secret key is configured", async () => {
    const { auth } = authWithCaptcha("");
    const res = await auth.handler(post("/sign-up/email", signUpBody));
    expect(res.status).toBe(200);
  });

  it("leaves sign-in unprotected", async () => {
    const { auth } = authWithCaptcha(FAILING_TEST_SECRET);
    const res = await auth.handler(
      post("/sign-in/email", {
        email: signUpBody.email,
        password: signUpBody.password,
      })
    );
    expect(res.status).toBe(401);
  });
});
