import type { APIRequestContext, Page } from "@playwright/test";

/** Wait for the SPA (admin-ui runs with ssr: false) to finish settling. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

interface AdminCredentials {
  usernameOrEmail: string;
  password: string;
}

export interface AuthenticatedAdminUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
}

// Mirrors admin-ui/app/api/auth.ts's isEmail (not exported there, so kept in
// sync by hand) so this picks the same sign-in endpoint the login form does.
const EMAIL_REGEX = /\S+@\S+\.\S+/;

function isEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

/**
 * Signs in via BetterAuth's sign-in endpoint directly, bypassing the login
 * form. Must run through a request context whose baseURL is the admin-ui
 * origin, not the backend port — backend-ts's CORS check rejects the latter.
 */
export async function authenticateAdmin(
  request: APIRequestContext,
  credentials: AdminCredentials = {
    usernameOrEmail: process.env.TEST_ADMIN_USERNAME ?? "",
    password: process.env.TEST_ADMIN_PASSWORD ?? "",
  }
): Promise<AuthenticatedAdminUser> {
  if (!credentials.usernameOrEmail || !credentials.password) {
    throw new Error(
      "TEST_ADMIN_USERNAME and TEST_ADMIN_PASSWORD must be set (copy .env.template to .env)."
    );
  }

  const endpoint = isEmail(credentials.usernameOrEmail)
    ? "/api/auth2/sign-in/email"
    : "/api/auth2/sign-in/username";
  const body = isEmail(credentials.usernameOrEmail)
    ? { email: credentials.usernameOrEmail, password: credentials.password }
    : { username: credentials.usernameOrEmail, password: credentials.password };

  const response = await request.post(endpoint, { data: body });
  if (!response.ok()) {
    throw new Error(
      `Admin sign-in failed (${response.status()}): ${await response.text()}`
    );
  }

  const { user } = (await response.json()) as {
    user: AuthenticatedAdminUser;
  };
  return user;
}

/**
 * Reads the signed-in user off an already-authenticated session (e.g.
 * `page.request` under the default project, which loads the shared admin
 * storageState). Sending that session's cookie through authenticateAdmin
 * again would trip BetterAuth's CSRF check (a cookie with no Origin header),
 * so use this instead when the session already exists.
 */
export async function fetchCurrentUser(
  request: APIRequestContext
): Promise<AuthenticatedAdminUser> {
  const response = await request.get("/api/auth2/get-session");
  if (!response.ok()) {
    throw new Error(
      `Fetching current user failed (${response.status()}): ${await response.text()}`
    );
  }

  const session = (await response.json()) as {
    user: AuthenticatedAdminUser;
  } | null;
  if (!session) {
    throw new Error("Fetching current user failed: no active session");
  }
  return session.user;
}
