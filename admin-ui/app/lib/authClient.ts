import type {
  AdminUiClientHeaders,
  HandlerAuthInstance,
} from "@raven/backend-ts/types";
import {
  customSessionClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // No baseURL: better-auth's client requires an absolute URL there (it
  // does `new URL(baseURL)` internally and throws on a relative path).
  // Omitting it lets the client derive the origin from `window.location`
  // itself and append basePath.
  basePath: "/api/auth2",
  // Asks `/get-session` for the admin UI's permissions (`isOrgAdmin`,
  // `canCreatePublications`); other clients' sessions don't carry them.
  fetchOptions: {
    headers: { "x-raven-client": "admin-ui" } satisfies AdminUiClientHeaders,
  },
  plugins: [usernameClient(), customSessionClient<HandlerAuthInstance>()],
});

export type SessionUser = typeof authClient.$Infer.Session.user;
