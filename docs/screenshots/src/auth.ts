import type { APIRequestContext, PlaywrightWorkerArgs } from "@playwright/test";

import { STACKS_BASE_URL, type Credentials } from "./env";

/**
 * Signs in through BetterAuth and stores the session cookie on `request`.
 * The request must go through the frontend origin: BetterAuth rejects a
 * sign-in whose Origin is not BASE_URL_WEB.
 */
export async function signIn(
  request: APIRequestContext,
  { username, password }: Credentials
): Promise<void> {
  const response = await request.post("/api/auth2/sign-in/username", {
    data: { username, password },
    headers: { Origin: STACKS_BASE_URL },
  });
  if (!response.ok()) {
    throw new Error(
      `Sign-in as "${username}" failed (${response.status()}): ${await response.text()}`
    );
  }
}

/** A request context that sends the frontend origin, as sign-in requires. */
export async function newApiContext(
  playwright: PlaywrightWorkerArgs["playwright"]
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: STACKS_BASE_URL,
    extraHTTPHeaders: { Origin: STACKS_BASE_URL },
  });
}
