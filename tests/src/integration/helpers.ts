import { escape } from "mysql2";
import request, { type Test } from "supertest";
import { expect } from "vitest";
import { execute, query, seedSession, seedVerifiedUser } from "./db.js";

export * from "./db.js";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:5555";
// See docker-compose.test.yml's datacite-mock service and datacite-mock/server.js.
const DATACITE_MOCK_URL =
  process.env.DATACITE_MOCK_URL ?? "http://localhost:4321";

export const DEFAULT_USER = {
  username: "testuser",
  email: "test@example.com",
  password: "password123",
  first_name: "Test",
  last_name: "User",
};

export function api() {
  return request(SERVER_URL);
}

export class TestApiClient {
  private token: string | null = null;

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = null;
  }

  get(path: string): Test {
    return this.auth(api().get(path));
  }

  post(path: string): Test {
    return this.auth(api().post(path));
  }

  put(path: string): Test {
    return this.auth(api().put(path));
  }

  patch(path: string): Test {
    return this.auth(api().patch(path));
  }

  delete(path: string): Test {
    return this.auth(api().delete(path));
  }

  /** Signs in with a username or an email, keeping the session's token. */
  async login(usernameOrEmail: string, password: string) {
    this.clearToken();
    const resp = usernameOrEmail.includes("@")
      ? await this.post("/api/auth2/sign-in/email").send({
          email: usernameOrEmail,
          password,
        })
      : await this.post("/api/auth2/sign-in/username").send({
          username: usernameOrEmail,
          password,
        });
    expect(resp.status).toBe(200);
    this.setToken(resp.body.token);
    return resp.body;
  }

  async logout() {
    const resp = await this.post("/api/auth2/sign-out").send({});
    expect(resp.status).toBe(200);
    expect(resp.body.success).toBe(true);
    this.clearToken();
    return resp.body;
  }

  private auth(test: Test): Test {
    return this.token
      ? test.set("Authorization", `Bearer ${this.token}`)
      : test;
  }
}

export function makeUser(
  username: string,
  overrides: Record<string, string> = {}
) {
  return {
    username,
    email: `${username}@example.com`,
    password: "password123",
    first_name: username[0]!.toUpperCase() + username.slice(1),
    last_name: "User",
    ...overrides,
  };
}

/** Seeds `user` as a verified better-auth user. */
export async function registerUser(
  // Unused, but kept so call sites match v1's `registerUser`.
  _client = new TestApiClient(),
  user = DEFAULT_USER
) {
  await seedVerifiedUser({
    ...user,
    name: `${user.first_name} ${user.last_name}`,
    firstName: user.first_name,
    lastName: user.last_name,
  });
  return { ...user };
}

export async function authClient() {
  const client = new TestApiClient();
  const user = await registerUser(client);
  await client.login(user.username, user.password);
  return { client, user };
}

export async function registerUserWithId(user = DEFAULT_USER) {
  const client = new TestApiClient();
  const registered = await registerUser(client, user);
  const userIds = await getUserIds(registered.username);
  return { client, user: registered, userId: userIds.id_int, userIds };
}

// ---------------------------------------------------------------------------
// auth2 (better-auth) — the only session mechanism v1 routes recognize.
// ---------------------------------------------------------------------------

export function makeAuth2User(
  username: string,
  overrides: Record<string, unknown> = {}
) {
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

/** Seeds a verified user and a session, setting its bearer token on `client`. */
export async function registerAuth2User(
  client = new TestApiClient(),
  user = makeAuth2User("authtwouser")
) {
  const seeded = await seedVerifiedUser(user);
  client.setToken((await seedSession(seeded.id)).token);
  return { ...user, ...seeded };
}

export async function registerAuth2UserWithId(
  user = makeAuth2User("authtwouser")
) {
  const client = new TestApiClient();
  const registered = await registerAuth2User(client, user);
  const userIds = await getUserIds(registered.username as string);
  return { client, user: registered, userId: userIds.id_int, userIds };
}

export async function authClientWithId() {
  const { client, user } = await authClient();
  const userIds = await getUserIds(user.username);
  return { client, user, userId: userIds.id_int, userIds };
}

export async function seedSiteAdmin(userId: number): Promise<void> {
  await execute(
    `UPDATE users SET state = 'SITE_ADMIN' WHERE id_int = ${userId}`
  );
}

export async function seedNotificationType(
  notifyType: string,
  opts: {
    priority?: number;
    name?: string;
    state?: string;
    trigger?: string;
  } = {}
): Promise<number> {
  const {
    name = notifyType,
    priority = 1,
    state = "ACTIVE",
    trigger = "new_comment",
  } = opts;
  const result = await execute(
    `INSERT INTO notification_types (type, name, priority, state, \`trigger\`) VALUES (${escape(notifyType)}, ${escape(name)}, ${priority}, ${escape(state)}, ${escape(trigger)})`
  );
  return result.insertId;
}

export async function seedNotificationTypesStandard() {
  await seedNotificationType("NEW_COMMENT__PARENT_COMMENTER", {
    name: "Parent commenter",
    priority: 1,
  });
  await seedNotificationType("NEW_COMMENT__BYLINE_CONTRIB", {
    priority: 2,
  });
  await seedNotificationType("NEW_COMMENT__NON_BYLINE_CONTRIB", {
    priority: 3,
  });
  await seedNotificationType("NEW_COMMENT__ORG_ADMIN", {
    priority: 4,
  });
}

export async function seedOrg(
  name = "Arcadia Science",
  slug = "arcadia-science"
): Promise<{ orgIdInt: number; orgId: string }> {
  const result = await execute(
    `INSERT INTO organizations (name, slug) VALUES (${escape(name)}, ${escape(slug)})`
  );
  const orgIds = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE id_int = ${result.insertId}`
  );

  const orgId = orgIds[0]?.id;

  // This shouldn't be possible, but in case it does fail it'll be less confusing to see the error here
  if (orgId == undefined) {
    throw new Error("org id unexpectedly undefined");
  }

  return { orgIdInt: result.insertId, orgId };
}

export async function seedOrgMember(
  orgId: number,
  userIds: { id: string; id_int: number },
  roles = ""
): Promise<void> {
  // Dual-writes org_id (ulid) alongside org_id_int, matching how the real
  // insert paths (v0's add_member/add_org_admin) populate this table.
  await execute(
    `INSERT INTO org_user_map (org_id_int, org_id, user_id, user_id_int, roles, start_at) SELECT ${orgId}, id, ${escape(userIds.id)}, ${userIds.id_int}, ${escape(roles)}, NOW() FROM organizations WHERE id_int = ${orgId}`
  );
}

export async function seedOrgMemberByUlid(
  orgId: string,
  userIds: { id: string; id_int: number },
  roles = ""
): Promise<void> {
  // Dual-writes org_id (ulid) alongside org_id_int, matching how the real
  // insert paths (v0's add_member/add_org_admin) populate this table.
  await execute(
    `INSERT INTO org_user_map (org_id, org_id_int, user_id, user_id_int, roles, start_at) SELECT '${orgId}', id_int, ${escape(userIds.id)}, ${userIds.id_int}, ${escape(roles)}, NOW() FROM organizations WHERE id = '${orgId}'`
  );
}

export async function seedPublication(opts: {
  ownerId: number;
  slug?: string;
  state?: string;
  title?: string;
}): Promise<{ intId: number; id: string }> {
  const slug = opts.slug ?? "test-pub";
  const state = opts.state ?? "DRAFT";
  const title = opts.title ?? "Test Publication";
  const pub = await execute(
    `INSERT INTO publications (slug, owner_id_int, state) VALUES (${escape(slug)}, ${opts.ownerId}, ${escape(state)})`
  );
  const version = await execute(
    `INSERT INTO versions (publication_id_int, version_number, title, state) VALUES (${pub.insertId}, 1, ${escape(title)}, ${escape(state)})`
  );
  const pubIds = await query<{ id: string }>(
    `SELECT id FROM publications WHERE id_int = ${pub.insertId}`
  );
  const pubIdStr = pubIds[0]!.id;
  // `contributors_bi` fills the ULID columns from the int ones.
  await execute(
    `INSERT INTO contributors (version_id_int, user_id_int, roles, in_byline, priority) VALUES (${version.insertId}, ${opts.ownerId}, '["Writing"]', true, 1)`
  );
  return { intId: pub.insertId, id: pubIdStr };
}

export async function getUserId(username: string): Promise<number> {
  const rows = await query<{ id: number }>(
    `SELECT id_int as id FROM users WHERE username = ${escape(username)}`
  );
  expect(rows[0]).toBeDefined();
  return rows[0]!.id;
}

export async function getUserIds(
  username: string
): Promise<{ id: string; id_int: number }> {
  const rows = await query<{ id: string; id_int: number }>(
    `SELECT id_int, id FROM users WHERE username = ${escape(username)}`
  );
  expect(rows[0]).toBeDefined();
  return { id: rows[0]!.id, id_int: rows[0]!.id_int };
}

// ---------------------------------------------------------------------------
// Media mock control (see docker-compose.test.yml / media-mock/server.js)
// ---------------------------------------------------------------------------

export * from "./media-mock.js";

// ---------------------------------------------------------------------------
// DataCite mock control (see docker-compose.test.yml / datacite-mock/server.js)
// ---------------------------------------------------------------------------

export interface DataciteMockCall {
  method: "POST" | "PUT" | "GET" | "DELETE";
  path: string;
  doi?: string;
  body: { data?: { attributes?: Record<string, unknown> } } | null;
  status: number;
}

export async function resetDataciteMock(): Promise<void> {
  const resp = await fetch(`${DATACITE_MOCK_URL}/_mock/reset`, {
    method: "POST",
  });
  expect(resp.ok).toBe(true);
}

export async function getDataciteMockCalls(): Promise<DataciteMockCall[]> {
  const resp = await fetch(`${DATACITE_MOCK_URL}/_mock/calls`);
  expect(resp.ok).toBe(true);
  const json = (await resp.json()) as { calls: DataciteMockCall[] };
  return json.calls;
}

export async function seedDoiMintingOrg(
  name: string,
  slug: string
): ReturnType<typeof seedOrg> {
  const orgId = await seedOrg(name, slug);
  await execute(
    `UPDATE organizations SET doi_minting_enabled = TRUE WHERE id_int = ${orgId.orgIdInt}`
  );
  return orgId;
}
