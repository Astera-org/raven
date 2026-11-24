import { escape } from "mysql2";
import request, { type Response, type Test } from "supertest";
import { expect } from "vitest";
import { execute, query, seedSession, seedVerifiedUser } from "../db.js";

export * from "../db.js";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:5555";
// See docker-compose.test.yml's datacite-mock service and datacite-mock/server.js.
const DATACITE_MOCK_URL =
  process.env.DATACITE_MOCK_URL ?? "http://localhost:4321";

export const DEFAULT_USER = {
  username: "testuser",
  email: "test@example.com",
  password: "password123",
  firstName: "Test",
  lastName: "User",
  name: "Test User",
};

export function api() {
  return request(SERVER_URL);
}

// Must be one of better-auth's trustedOrigins (BASE_URL_WEB in
// backend-ts/tests/raven.test.toml): it rejects cookie-bearing mutations
// whose Origin header is missing or untrusted.
const TRUSTED_ORIGIN = "https://example.com";

/**
 * Authenticates via better-auth session cookies, which the underlying
 * supertest agent stores from responses and replays on later requests, or
 * via a seeded session's bearer token (`useSession`), which overrides them.
 */
export class TestApiClient {
  private agent = createAgent();
  private sessionToken: string | null = null;

  get(path: string): Test {
    return this.auth(this.agent.get(path));
  }

  post(path: string): Test {
    return this.auth(this.agent.post(path));
  }

  put(path: string): Test {
    return this.auth(this.agent.put(path));
  }

  patch(path: string): Test {
    return this.auth(this.agent.patch(path));
  }

  delete(path: string): Test {
    return this.auth(this.agent.delete(path));
  }

  useSession(token: string): void {
    this.sessionToken = token;
  }

  async login(username: string, password: string) {
    this.sessionToken = null;
    const resp = await this.post("/api/auth2/sign-in/username").send({
      username,
      password,
    });
    expect(resp.status).toBe(200);
    return resp.body;
  }

  async logout() {
    const resp = await this.post("/api/auth2/sign-out").send({});
    expect(resp.status).toBe(200);
    expect(resp.body.success).toBe(true);
    this.sessionToken = null;
    return resp.body;
  }

  clearSession(): void {
    this.agent = createAgent();
    this.sessionToken = null;
  }

  private auth(test: Test): Test {
    return this.sessionToken
      ? test.set("Authorization", `Bearer ${this.sessionToken}`)
      : test;
  }
}

function createAgent() {
  return request.agent(SERVER_URL).set("Origin", TRUSTED_ORIGIN);
}

export function makeUser(
  username: string,
  overrides: Record<string, string> = {}
) {
  const firstName = username[0]!.toUpperCase() + username.slice(1);
  return {
    username,
    email: `${username}@example.com`,
    password: "password123",
    firstName,
    lastName: "User",
    name: `${firstName} User`,
    ...overrides,
  };
}

type RegisterResp = {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  displayUsername: string;
  profile: string | null;
  idInt: number;
  orcid: string | null;
  approved: boolean;
  state: string;
  id: string;
};

/**
 * Seeds a verified user and a session for them, leaving `client` holding it.
 * Tests of sign-in itself, or of what it records, should call `login`.
 */
export async function registerUser(
  client = new TestApiClient(),
  user = DEFAULT_USER
): Promise<RegisterResp> {
  const seeded = await seedVerifiedUser(user);
  client.useSession((await seedSession(seeded.id)).token);
  return { ...user, ...seeded };
}

export async function authClient() {
  const client = new TestApiClient();
  const user = await registerUser(client);
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

/** Seeds a verified user and a session for them, leaving `client` holding it. */
export async function registerAuth2User(
  client = new TestApiClient(),
  user = makeAuth2User("authtwouser")
) {
  const seeded = await seedVerifiedUser(user);
  client.useSession((await seedSession(seeded.id)).token);
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

/**
 * Puts the logged-in user in a draft's byline, replacing its contributors.
 * Publishing needs someone in the byline, and a MyST create only adds the
 * document's authors who are Stacks users.
 */
export async function addSelfToByline(
  client: TestApiClient,
  publicationId: string
): Promise<void> {
  const session = await client.get("/api/auth2/get-session");
  expect(session.status).toBe(200);
  const res = await client
    .patch(`/api/v1/publications/id/${publicationId}/draft`)
    .send({
      contributors: [
        {
          userId: session.body.user.id,
          roles: ["Writing"],
          inByline: true,
          affiliations: [],
        },
      ],
    });
  expect(res.status, res.text).toBe(200);
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
}): Promise<{
  intId: number;
  id: string;
  versionId: string;
  versionIdInt: number;
}> {
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
  const versionIds = await query<{ id: string }>(
    `SELECT id FROM versions WHERE id_int = ${version.insertId}`
  );
  // `contributors_bi` fills the ULID columns from the int ones.
  await execute(
    `INSERT INTO contributors (version_id_int, user_id_int, roles, in_byline, priority) VALUES (${version.insertId}, ${opts.ownerId}, '["Writing"]', true, 1)`
  );
  return {
    intId: pub.insertId,
    id: pubIds[0]!.id,
    versionId: versionIds[0]!.id,
    versionIdInt: version.insertId,
  };
}

// A publication with a canonical DOI and a version DOI the DataCite mock has
// never seen, so a comparison reports DataCite's record as not found.
export async function seedComparedPublication(
  ownerId: number,
  slug: string,
  state = "PUBLISHED"
) {
  const pub = await seedPublication({
    ownerId,
    slug,
    state,
    title: "Comparison Title",
  });
  const canonicalDoi = `10.83972/cmp-${slug}`;
  const versionDoi = `${canonicalDoi}.1`;
  await execute(
    `UPDATE publications SET doi = ${escape(canonicalDoi)} WHERE id_int = ${pub.intId}`
  );
  await execute(
    `UPDATE versions SET doi = ${escape(versionDoi)} WHERE publication_id_int = ${pub.intId}`
  );
  return { ...pub, canonicalDoi, versionDoi };
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

/** One route under test, so a shared set of checks can run against each. */
export type RouteCase<Target> = {
  name: string;
  send: (client: TestApiClient, target: Target) => Test;
};

export async function loggedInUser(username: string) {
  return registerUserWithId(makeUser(username));
}

export async function endMembership(
  org: { orgIdInt: number },
  userIds: { id: string }
): Promise<void> {
  await execute(
    `UPDATE org_user_map SET end_at = NOW() - INTERVAL 1 DAY WHERE org_id_int = ${org.orgIdInt} AND user_id = ${escape(userIds.id)}`
  );
}

export async function setMembershipStart(
  org: { orgIdInt: number },
  userIdInt: number,
  startAt: string | null
): Promise<void> {
  await execute(
    `UPDATE org_user_map SET start_at = ${escape(startAt)} WHERE org_id_int = ${org.orgIdInt} AND user_id_int = ${userIdInt}`
  );
}

export async function linkOrg(
  org: { orgIdInt: number; orgId: string },
  pub: { intId: number; id: string },
  priority = 0
): Promise<void> {
  await execute(
    `INSERT INTO org_publication_map (org_id_int, org_id, publication_id_int, publication_id, priority) VALUES (${org.orgIdInt}, ${escape(org.orgId)}, ${pub.intId}, ${escape(pub.id)}, ${priority})`
  );
}

// ---------------------------------------------------------------------------
// v1 error envelopes
// ---------------------------------------------------------------------------

export const UNAUTHENTICATED = {
  type: "application_error",
  errors: { auth: { message: "Authentication required" } },
};
export const PERMISSION_DENIED = {
  type: "application_error",
  errors: { auth: { message: "Permission denied" } },
};
export const ADMIN_FORBIDDEN = {
  type: "application_error",
  errors: { auth: { message: "Admin permission required" } },
};

export function expectValidationError(resp: Response): void {
  expect(resp.status).toBe(422);
  expect(resp.body.type).toBe("validation_error");
}

// ---------------------------------------------------------------------------
// Media mock control (see docker-compose.test.yml / media-mock/server.js)
// ---------------------------------------------------------------------------

export * from "../media-mock.js";

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

/** Makes the mock fail DELETEs of `doi` until the next resetDataciteMock(). */
export async function failDataciteDelete(doi: string): Promise<void> {
  const resp = await fetch(`${DATACITE_MOCK_URL}/_mock/fail-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doi }),
  });
  expect(resp.ok).toBe(true);
}

/**
 * Makes `attributes` DataCite's whole record for `doi`. The mock's PUT merges
 * into a stored record and its reset keeps records, so any earlier record is
 * deleted first: otherwise attributes from a previous run could linger.
 */
export async function seedDataciteRecord(
  doi: string,
  attributes: Record<string, unknown>
): Promise<void> {
  const deleted = await fetch(`${DATACITE_MOCK_URL}/dois/${doi}`, {
    method: "DELETE",
  });
  // 404 when the mock has no record for the DOI yet.
  expect([204, 404]).toContain(deleted.status);
  const resp = await fetch(`${DATACITE_MOCK_URL}/dois/${doi}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { attributes } }),
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
