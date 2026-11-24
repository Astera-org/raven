import { escape } from "mysql2";
import { describe, expect, it } from "vitest";
import {
  execute,
  makeUser,
  markEmailVerified,
  query,
  registerUser,
  TestApiClient,
} from "./helpers.js";

function auth2User(username: string, overrides: Record<string, unknown> = {}) {
  const displayName = username[0]!.toUpperCase() + username.slice(1);
  return {
    name: `${displayName} User`,
    email: `${username}@example.com`,
    password: "password123",
    username,
    firstName: displayName,
    lastName: "User",
    ...overrides,
  };
}

/** Signs up, verifies the email, then signs in for a session token. */
async function signUpAuth2(
  client: TestApiClient,
  user: ReturnType<typeof auth2User>
) {
  const signUp = await client.post("/api/auth2/sign-up/email").send(user);
  expect(signUp.status).toBe(200);
  await markEmailVerified(user.email);
  const signIn = await client
    .post("/api/auth2/sign-in/email")
    .send({ email: user.email, password: user.password });
  expect(signIn.status).toBe(200);
  return signIn.body as { token: string; user: Record<string, unknown> };
}

// Werkzeug scrypt hash (N=32768, r=8, p=1) of the password `password123`, as found in
// `accounts.password` for users whose accounts predate better-auth.
const LEGACY_PASSWORD = "password123";
const LEGACY_SCRYPT_HASH =
  "scrypt:32768:8:1$lJPIKIKHC6RSrwxU$3e4f8fe7ab3ebf6c454f0c6bb4cc7a91e423747c9c9891b614d7c9d373af51b791f18aa314bd7ef45ffe402525bc812a307412484f841802f08da302ef3f7d5a";

// Seeds a user + credential account directly via SQL, bypassing sign-up, so the
// account's password is a legacy scrypt hash rather than one better-auth generated.
async function seedLegacyCredentialUser(username: string) {
  const email = `${username}@example.com`;
  const displayName = username[0]!.toUpperCase() + username.slice(1);
  await execute(`
    INSERT INTO users (id, username, email, email_verified, first_name, last_name, name)
    VALUES (ULID(), ${escape(username)}, ${escape(email)}, TRUE, ${escape(displayName)}, 'User', ${escape(`${displayName} User`)})
  `);
  await execute(`
    INSERT INTO accounts (id, account_id, provider_id, user_id, password, updated_at)
    SELECT ULID(), id, 'credential', id, ${escape(LEGACY_SCRYPT_HASH)}, NOW()
    FROM users WHERE username = ${escape(username)}
  `);
  return { email, username };
}

async function getCredentialPassword(username: string): Promise<string> {
  const rows = await query<{ password: string }>(`
    SELECT a.password AS password
    FROM accounts a
    JOIN users u ON u.id = a.user_id
    WHERE u.username = ${escape(username)} AND a.provider_id = 'credential'
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!.password;
}

describe("/api/auth2/sign-up/email", () => {
  it("registers a user without signing them in", async () => {
    const client = new TestApiClient();
    const resp = await client
      .post("/api/auth2/sign-up/email")
      .send(auth2User("auth2reg"));
    expect(resp.status).toBe(200);
    expect(resp.body.token).toBeNull();
    expect(resp.headers["set-cookie"] ?? []).not.toContainEqual(
      expect.stringContaining("better-auth.session_token")
    );

    const { user } = resp.body;
    expect(user.username).toBe("auth2reg");
    expect(user.email).toBe("auth2reg@example.com");
    expect(user.firstName).toBe("Auth2reg");
    expect(user.lastName).toBe("User");
    expect(typeof user.idInt).toBe("number");
    expect(typeof user.id).toBe("string");
    expect(user.id).toHaveLength(26);
    expect(user.state).toBe("ACTIVE");
    expect(user.emailVerified).toBe(false);
  });

  // With verification required, better-auth answers a duplicate email like a
  // new sign-up, so the response doesn't reveal which emails have accounts.
  it("does not create a second user for a duplicate email", async () => {
    const client = new TestApiClient();
    await signUpAuth2(client, auth2User("dupemail1"));
    const resp = await client
      .post("/api/auth2/sign-up/email")
      .send(auth2User("dupemail2", { email: "dupemail1@example.com" }));
    expect(resp.status).toBe(200);
    expect(resp.body.token).toBeNull();
    const rows = await query(
      `SELECT username FROM users WHERE email = 'dupemail1@example.com'`
    );
    expect(rows).toEqual([{ username: "dupemail1" }]);
  });

  it("rejects a duplicate username", async () => {
    const client = new TestApiClient();
    await signUpAuth2(client, auth2User("dupusername"));
    const resp = await client
      .post("/api/auth2/sign-up/email")
      .send(auth2User("dupusername", { email: "differentemail@example.com" }));
    expect(resp.status).toBe(400);
    expect(resp.body.code).toBe("USERNAME_IS_ALREADY_TAKEN");
  });

  it("rejects missing required fields", async () => {
    const client = new TestApiClient();
    const { firstName: _firstName, ...withoutFirstName } =
      auth2User("missingfield");
    const resp = await client
      .post("/api/auth2/sign-up/email")
      .send(withoutFirstName);
    expect(resp.status).toBe(400);
    expect(resp.body.code).toBe("MISSING_FIELD");
  });

  it("rejects an invalid email address", async () => {
    const client = new TestApiClient();
    const resp = await client
      .post("/api/auth2/sign-up/email")
      .send(auth2User("bademail", { email: "not-an-email" }));
    expect(resp.status).toBe(400);
    expect(resp.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a password that is too short", async () => {
    const client = new TestApiClient();
    const resp = await client
      .post("/api/auth2/sign-up/email")
      .send(auth2User("shortpw", { password: "ab" }));
    expect(resp.status).toBe(400);
    expect(resp.body.code).toBe("PASSWORD_TOO_SHORT");
  });

  it("rejects a username that is too short", async () => {
    const client = new TestApiClient();
    const resp = await client
      .post("/api/auth2/sign-up/email")
      .send(auth2User("ab", { email: "shortusername@example.com" }));
    expect(resp.status).toBe(400);
    expect(resp.body.code).toBe("USERNAME_TOO_SHORT");
  });
});

describe("email verification", () => {
  async function signUpUnverified(username: string) {
    const user = auth2User(username);
    const resp = await new TestApiClient()
      .post("/api/auth2/sign-up/email")
      .send(user);
    expect(resp.status).toBe(200);
    return user;
  }

  it("blocks email sign-in until the email is verified", async () => {
    const user = await signUpUnverified("unverifiedemail");
    const signIn = () =>
      new TestApiClient()
        .post("/api/auth2/sign-in/email")
        .send({ email: user.email, password: user.password });

    const blocked = await signIn();
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("EMAIL_NOT_VERIFIED");

    await markEmailVerified(user.email);
    expect((await signIn()).status).toBe(200);
  });

  it("blocks username sign-in until the email is verified", async () => {
    const user = await signUpUnverified("unverifieduname");
    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/username")
      .send({ username: user.username, password: user.password });
    expect(resp.status).toBe(403);
    expect(resp.body.code).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("/api/auth2/sign-in/email", () => {
  it("signs in with correct credentials", async () => {
    const client = new TestApiClient();
    await signUpAuth2(client, auth2User("signinemail"));

    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email: "signinemail@example.com", password: "password123" });
    expect(resp.status).toBe(200);
    expect(resp.body.token).toBeDefined();
    expect(resp.body.user.username).toBe("signinemail");
  });

  it("records the sign-in time in users.login_at", async () => {
    const user = auth2User("loginatemail");
    const signUp = await new TestApiClient()
      .post("/api/auth2/sign-up/email")
      .send(user);
    expect(signUp.status).toBe(200);
    await markEmailVerified(user.email);

    const loginAt = async () =>
      (
        await query<{ login_at: Date | null }>(
          `SELECT login_at FROM users WHERE username = ${escape(user.username)}`
        )
      )[0]!.login_at;
    expect(await loginAt()).toBeNull();

    const signIn = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email: user.email, password: user.password });
    expect(signIn.status).toBe(200);
    expect(await loginAt()).not.toBeNull();
  });

  it("rejects an incorrect password", async () => {
    const client = new TestApiClient();
    await signUpAuth2(client, auth2User("badpwemail"));

    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email: "badpwemail@example.com", password: "wrongpass" });
    expect(resp.status).toBe(401);
    expect(resp.body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("rejects an unknown email", async () => {
    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email: "noone@example.com", password: "whatever123" });
    expect(resp.status).toBe(401);
  });
});

describe("/api/auth2/sign-in/username", () => {
  it("signs in with correct credentials", async () => {
    const client = new TestApiClient();
    await signUpAuth2(client, auth2User("signinuname"));

    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/username")
      .send({ username: "signinuname", password: "password123" });
    expect(resp.status).toBe(200);
    expect(resp.body.user.email).toBe("signinuname@example.com");
  });

  it("rejects an incorrect password", async () => {
    const client = new TestApiClient();
    await signUpAuth2(client, auth2User("badpwuname"));

    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/username")
      .send({ username: "badpwuname", password: "wrongpass" });
    expect(resp.status).toBe(401);
    expect(resp.body.code).toBe("INVALID_USERNAME_OR_PASSWORD");
  });

  it("rejects an unknown username", async () => {
    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/username")
      .send({ username: "nosuchuser", password: "whatever123" });
    expect(resp.status).toBe(401);
  });
});

describe("/api/auth2/is-username-available", () => {
  it("reports availability correctly", async () => {
    const client = new TestApiClient();
    await signUpAuth2(client, auth2User("takenname"));

    const taken = await new TestApiClient()
      .post("/api/auth2/is-username-available")
      .send({ username: "takenname" });
    expect(taken.status).toBe(200);
    expect(taken.body.available).toBe(false);

    const free = await new TestApiClient()
      .post("/api/auth2/is-username-available")
      .send({ username: "totallyfreename" });
    expect(free.status).toBe(200);
    expect(free.body.available).toBe(true);
  });
});

describe("/api/auth2/get-session", () => {
  it("returns the session and user for a valid token", async () => {
    const client = new TestApiClient();
    const { token } = await signUpAuth2(client, auth2User("sessioncheck"));
    client.setToken(token);

    const resp = await client.get("/api/auth2/get-session");
    expect(resp.status).toBe(200);
    expect(resp.body.session.token).toBe(token);
    expect(resp.body.user.username).toBe("sessioncheck");
  });

  it("returns null when unauthenticated", async () => {
    const resp = await new TestApiClient().get("/api/auth2/get-session");
    expect(resp.status).toBe(200);
    expect(resp.body).toBeNull();
  });
});

describe("/api/auth2/update-user", () => {
  it("updates the authenticated user's profile", async () => {
    const client = new TestApiClient();
    const { token } = await signUpAuth2(client, auth2User("updateprofile"));
    client.setToken(token);

    const resp = await client
      .post("/api/auth2/update-user")
      .send({ firstName: "Updated", lastName: "Person" });
    expect(resp.status).toBe(200);
    expect(resp.body.status).toBe(true);

    const session = await client.get("/api/auth2/get-session");
    expect(session.body.user.firstName).toBe("Updated");
    expect(session.body.user.lastName).toBe("Person");
  });

  it("rejects unauthenticated requests", async () => {
    const resp = await new TestApiClient()
      .post("/api/auth2/update-user")
      .send({ firstName: "Hacked" });
    expect(resp.status).toBe(401);
  });
});

describe("/api/auth2/change-password", () => {
  it("changes the authenticated user's password", async () => {
    const client = new TestApiClient();
    const { token } = await signUpAuth2(client, auth2User("changepwauth2"));
    client.setToken(token);

    const resp = await client.post("/api/auth2/change-password").send({
      currentPassword: "password123",
      newPassword: "new-password-456",
    });
    expect(resp.status).toBe(200);

    const oldPasswordLogin = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email: "changepwauth2@example.com", password: "password123" });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({
        email: "changepwauth2@example.com",
        password: "new-password-456",
      });
    expect(newPasswordLogin.status).toBe(200);
  });

  it("rejects an incorrect current password", async () => {
    const client = new TestApiClient();
    const { token } = await signUpAuth2(client, auth2User("badcurrentauth2"));
    client.setToken(token);

    const resp = await client.post("/api/auth2/change-password").send({
      currentPassword: "wrong-password",
      newPassword: "new-password-456",
    });
    expect(resp.status).toBe(400);
    expect(resp.body.code).toBe("INVALID_PASSWORD");
  });

  it("rejects unauthenticated requests", async () => {
    const resp = await new TestApiClient()
      .post("/api/auth2/change-password")
      .send({
        currentPassword: "password123",
        newPassword: "new-password-456",
      });
    expect(resp.status).toBe(401);
  });
});

describe("/api/auth2/sign-out", () => {
  it("invalidates the session token", async () => {
    const client = new TestApiClient();
    const { token } = await signUpAuth2(client, auth2User("signoutauth2"));
    client.setToken(token);

    const resp = await client.post("/api/auth2/sign-out").send({});
    expect(resp.status).toBe(200);
    expect(resp.body.success).toBe(true);

    const session = await client.get("/api/auth2/get-session");
    expect(session.body).toBeNull();
  });
});

describe("auth2 and legacy API interop", () => {
  it("authenticates against legacy routes using an auth2 session token", async () => {
    const client = new TestApiClient();
    const { token, user } = await signUpAuth2(client, auth2User("interopuser"));
    client.setToken(token);

    const resp = await client.get("/api/auth/me");
    expect(resp.status).toBe(200);
    expect(resp.body.user.id).toBe(user.idInt);
    expect(resp.body.user.username).toBe("interopuser");
    expect(resp.body.user.first_name).toBe("Interopuser");
  });
});

describe("password change interop between legacy and auth2", () => {
  it("syncs a legacy password change to the better-auth credential account", async () => {
    const client = new TestApiClient();
    const user = await registerUser(client, makeUser("legacychangepw"));
    await client.login(user.username, user.password);

    const resp = await client.post("/api/auth/change_password").send({
      current_password: user.password,
      new_password: "new-password-456",
    });
    expect(resp.status).toBe(200);

    const oldPasswordLogin = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email: user.email, password: user.password });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email: user.email, password: "new-password-456" });
    expect(newPasswordLogin.status).toBe(200);
    expect(newPasswordLogin.body.user.username).toBe(user.username);
  });

  it("syncs an auth2 password change back to the legacy users table", async () => {
    const client = new TestApiClient();
    const user = auth2User("authchangepw");
    const { token } = await signUpAuth2(client, user);
    client.setToken(token);

    const resp = await client.post("/api/auth2/change-password").send({
      currentPassword: user.password,
      newPassword: "new-password-456",
    });
    expect(resp.status).toBe(200);

    const oldPasswordLogin = await new TestApiClient()
      .post("/api/auth/login")
      .send({ username: user.username, password: user.password });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await new TestApiClient()
      .post("/api/auth/login")
      .send({ username: user.username, password: "new-password-456" });
    expect(newPasswordLogin.status).toBe(200);
    expect(newPasswordLogin.body.user.username).toBe(user.username);
  });
});

describe("legacy scrypt password verification", () => {
  it("signs in with a legacy scrypt hash and upgrades it to better-auth's format", async () => {
    const { email, username } = await seedLegacyCredentialUser("legacyupgrade");
    expect(await getCredentialPassword(username)).toBe(LEGACY_SCRYPT_HASH);

    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email, password: LEGACY_PASSWORD });
    expect(resp.status).toBe(200);
    expect(resp.body.user.username).toBe(username);

    const upgraded = await getCredentialPassword(username);
    expect(upgraded).not.toBe(LEGACY_SCRYPT_HASH);
    expect(upgraded.startsWith("scrypt:")).toBe(false);
  });

  it("keeps working with the upgraded hash on subsequent logins", async () => {
    const { email, username } = await seedLegacyCredentialUser("legacyrelogin");

    const first = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email, password: LEGACY_PASSWORD });
    expect(first.status).toBe(200);
    const upgraded = await getCredentialPassword(username);

    const second = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email, password: LEGACY_PASSWORD });
    expect(second.status).toBe(200);
    expect(second.body.user.username).toBe(username);

    // The hash shouldn't churn on every successful login, only the first upgrade.
    expect(await getCredentialPassword(username)).toBe(upgraded);
  });

  it("rejects an incorrect password against a legacy hash and leaves it unchanged", async () => {
    const { email, username } = await seedLegacyCredentialUser("legacybadpw");

    const resp = await new TestApiClient()
      .post("/api/auth2/sign-in/email")
      .send({ email, password: "wrong-password" });
    expect(resp.status).toBe(401);

    expect(await getCredentialPassword(username)).toBe(LEGACY_SCRYPT_HASH);
  });
});

describe("/api/auth2/device/*", () => {
  const CLIENT_ID = "stacks-cli";

  async function requestDeviceCode() {
    const resp = await new TestApiClient()
      .post("/api/auth2/device/code")
      .send({ client_id: CLIENT_ID });
    expect(resp.status).toBe(200);
    return resp.body as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      verification_uri_complete: string;
    };
  }

  function pollToken(deviceCode: string) {
    return new TestApiClient().post("/api/auth2/device/token").send({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: CLIENT_ID,
    });
  }

  it("issues a code that points at the web app's /device page", async () => {
    const code = await requestDeviceCode();

    expect(code.verification_uri).toBe("https://example.com/device");
    expect(code.verification_uri_complete).toBe(
      `https://example.com/device?user_code=${code.user_code}`
    );
  });

  it("rejects clients other than the CLI", async () => {
    const resp = await new TestApiClient()
      .post("/api/auth2/device/code")
      .send({ client_id: "someone-else" });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toBe("invalid_client");
  });

  it("reports a code nobody has approved yet as pending", async () => {
    const code = await requestDeviceCode();

    const resp = await pollToken(code.device_code);
    expect(resp.status).toBe(400);
    expect(resp.body.error).toBe("authorization_pending");
  });

  /** Signs up a user who opens the code's page, which claims it for them. */
  async function claimAs(username: string, userCode: string) {
    const client = new TestApiClient();
    const { token } = await signUpAuth2(client, auth2User(username));
    client.setToken(token);
    const verify = await client.get(
      `/api/auth2/device?user_code=${encodeURIComponent(userCode)}`
    );
    expect(verify.status).toBe(200);
    return { client, token };
  }

  // Each test polls once: the server answers slow_down to polls under 5s apart.
  it("returns a working session token once a signed-in user approves", async () => {
    const code = await requestDeviceCode();
    const { client: approver, token } = await claimAs(
      "deviceapprove",
      code.user_code
    );

    const approve = await approver
      .post("/api/auth2/device/approve")
      .send({ userCode: code.user_code });
    expect(approve.status).toBe(200);

    const granted = await pollToken(code.device_code);
    expect(granted.status).toBe(200);
    expect(granted.body.access_token).not.toBe(token);

    const cli = new TestApiClient();
    cli.setToken(granted.body.access_token);
    const session = await cli.get("/api/auth2/get-session");
    expect(session.body.user.username).toBe("deviceapprove");
  });

  it("refuses approval without a session", async () => {
    const code = await requestDeviceCode();

    const resp = await new TestApiClient()
      .post("/api/auth2/device/approve")
      .send({ userCode: code.user_code });
    expect(resp.status).toBe(401);
  });

  it("reports a denied code as access_denied", async () => {
    const code = await requestDeviceCode();
    const { client: denier } = await claimAs("devicedeny", code.user_code);

    const deny = await denier
      .post("/api/auth2/device/deny")
      .send({ userCode: code.user_code });
    expect(deny.status).toBe(200);

    const resp = await pollToken(code.device_code);
    expect(resp.status).toBe(400);
    expect(resp.body.error).toBe("access_denied");
  });
});
