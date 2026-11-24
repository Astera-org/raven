/**
 * Auth helpers. Per the design, auth on a test case is resolved by
 * the runner by logging in as a seeded user once per (worker, fixture-set,
 * user) tuple and caching the resulting token.
 *
 * Tokens contain only the user id and a signing-time iat/exp; they are
 * NOT included in response snapshots (the auth response itself is, but
 * snapshots that USE a token strip the `Authorization` header automatically
 * since we don't capture request headers).
 */

import type { TargetConfig } from "./types.ts";

interface TokenCacheKey {
  targetId: string;
  username: string;
}

const betterAuthCache = new Map<
  string,
  { token: string; cookie: string | null }
>();

function cacheKey(k: TokenCacheKey): string {
  return `${k.targetId}::${k.username}`;
}

/** Invalidate cached tokens; called between tests since fixtures reset users. */
export function clearTokenCache(targetId?: string): void {
  if (targetId === undefined) {
    betterAuthCache.clear();
    return;
  }
  const prefix = `${targetId}::`;
  for (const k of betterAuthCache.keys()) {
    if (k.startsWith(prefix)) betterAuthCache.delete(k);
  }
}

/**
 * Log in as the named user via better-auth's `/auth2/sign-in/username`
 * endpoint (only implemented on backend-ts) and return
 * the session token.
 */
export async function loginAsBetterAuth(
  target: TargetConfig,
  username: string
): Promise<{ token: string; cookie: string | null }> {
  const key = cacheKey({ targetId: target.id, username });
  const cached = betterAuthCache.get(key);
  if (cached !== undefined) return cached;

  const res = await fetch(`${target.baseUrl}/auth2/sign-in/username`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "password123" }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to log in via better-auth as ${username} on ${target.id}: HTTP ${res.status} ${text}`
    );
  }

  const body = (await res.json()) as { token?: string };

  if (typeof body.token !== "string") {
    throw new Error(
      `better-auth sign-in response from ${target.id} missing token: ${JSON.stringify(body)}`
    );
  }

  const sessionCookie = extractCookie(res);

  betterAuthCache.set(key, { token: body.token, cookie: sessionCookie });
  return { token: body.token, cookie: sessionCookie };
}

function extractCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  // just want the name=value pair, not the Path/HttpOnly/etc attributes
  return setCookie.split(";")[0] ?? null;
}
