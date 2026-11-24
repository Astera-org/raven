import type { Config } from "#src/config.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getConfig: vi.fn() }));

vi.mock("#src/config.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConfig: mocks.getConfig,
}));

const { logger } = await import("#src/lib/logger.js");
const {
  emailBylinesAboutNewComment,
  emailCommenterAboutReply,
  sendVerificationEmail,
} = await import("#src/lib/mail.js");

const TEST_RECIPIENT = "inbox@test.example";

const COMMENT = {
  id_int: 7,
  user_id_int: 1,
  publication_id: 3,
  body: "Nice work",
  commenter_name: "Carol Commenter",
};
const PUBLICATION = { id_int: 3, slug: "a-pub", title: "A Pub" };
const ALICE = {
  id_int: 2,
  email: "alice@real.example",
  first_name: "Alice",
  last_name: "Author",
};
const BOB = {
  id_int: 4,
  email: "bob@real.example",
  first_name: "Bob",
  last_name: "Byline",
};

function useConfig(overrides: Partial<Config>) {
  mocks.getConfig.mockReturnValue({
    ENVIRONMENT: "staging",
    MAILGUN_API_KEY: "key-123",
    MAILGUN_API_URL: "https://mailgun.test/messages",
    TEST_RECIPIENT_EMAIL_ADDRESS: TEST_RECIPIENT,
    BASE_URL_WEB: "https://web.example",
    BASE_URL_API: "https://api.example/api",
    JWT_SECRET_KEY: "secret",
    ...overrides,
  });
}

function sentForm(fetchMock: ReturnType<typeof vi.fn>): URLSearchParams {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0]![1] as RequestInit;
  return new URLSearchParams(init.body as string);
}

function loggedForm(infoSpy: ReturnType<typeof vi.spyOn>) {
  const call = infoSpy.mock.calls.find(
    ([, message]) => message === "Email sent to log."
  );
  expect(call).toBeDefined();
  return (call![0] as { formData: Record<string, string> }).formData;
}

let fetchMock: ReturnType<typeof vi.fn>;
let infoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notification emails", () => {
  it("are sent to the real recipients in production", async () => {
    useConfig({ ENVIRONMENT: "production" });

    const sent = await emailBylinesAboutNewComment(
      COMMENT,
      PUBLICATION,
      [ALICE, BOB],
      "NEW_COMMENT__BYLINE_CONTRIB"
    );

    expect(sent).toBe(true);
    const form = sentForm(fetchMock);
    expect(form.get("to")).toBe(
      "Alice Author <alice@real.example>,Bob Byline <bob@real.example>"
    );
    expect(Object.keys(JSON.parse(form.get("recipient-variables")!))).toEqual([
      "alice@real.example",
      "bob@real.example",
    ]);
  });

  it("are only logged, addressed to the test recipient, outside production", async () => {
    useConfig({});

    const sent = await emailBylinesAboutNewComment(
      COMMENT,
      PUBLICATION,
      [ALICE, BOB],
      "NEW_COMMENT__BYLINE_CONTRIB"
    );

    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    const formData = loggedForm(infoSpy);
    expect(formData["to"]).toBe(
      `Alice Author <${TEST_RECIPIENT}>,Bob Byline <${TEST_RECIPIENT}>`
    );
    expect(Object.keys(JSON.parse(formData["recipient-variables"]!))).toEqual([
      TEST_RECIPIENT,
    ]);
    expect(JSON.stringify(formData)).not.toContain("real.example");
  });

  it("log the help address when no test recipient is set", async () => {
    useConfig({ TEST_RECIPIENT_EMAIL_ADDRESS: "" });

    await emailCommenterAboutReply(
      COMMENT,
      PUBLICATION,
      ALICE,
      "NEW_COMMENT__PARENT_COMMENTER"
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggedForm(infoSpy)["to"]).toBe("Alice Author <help@thestacks.org>");
  });
});

describe("auth emails", () => {
  it("are sent to the real recipient outside production", async () => {
    useConfig({});

    const sent = await sendVerificationEmail(
      { name: "Alice Author", email: ALICE.email },
      "https://api.example/api/auth2/verify-email?token=abc"
    );

    expect(sent).toBe(true);
    expect(sentForm(fetchMock).get("to")).toBe(
      "Alice Author <alice@real.example>"
    );
  });

  it("are not sent without a Mailgun key", async () => {
    useConfig({ ENVIRONMENT: "production", MAILGUN_API_KEY: "" });
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    const sent = await sendVerificationEmail(
      { name: "Alice Author", email: ALICE.email },
      "https://api.example/api/auth2/verify-email?token=abc"
    );

    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
