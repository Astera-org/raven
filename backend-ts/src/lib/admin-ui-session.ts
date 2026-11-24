import { makeRepositories } from "#v1/db-repositories/index.js";
import { resolveAdminScope } from "#v1/routes/admin/middleware/require-admin-scope.js";
import { canCreatePublication } from "#v1/routes/publications/helpers/can-create-publication.js";

export const ADMIN_UI_CLIENT_HEADER = "x-raven-client";
const ADMIN_UI_CLIENT = "admin-ui";

/**
 * The header admin-ui's auth client sends so `/get-session` adds its
 * permissions. Exported as a type so admin-ui can check its literal against
 * it without importing backend runtime code.
 */
export type AdminUiClientHeaders = Record<
  typeof ADMIN_UI_CLIENT_HEADER,
  typeof ADMIN_UI_CLIENT
>;

export interface AdminUiPermissions {
  isOrgAdmin: boolean;
  canCreatePublications: boolean;
}

/**
 * The admin UI's permissions for `/get-session`, or none for any other
 * client, so their session responses stay unchanged. Each comes from the
 * helper the v1 routes enforce, so the UI can't disagree with them.
 */
export async function resolveAdminUiPermissions(
  headers: Headers | undefined,
  userId: string
): Promise<Partial<AdminUiPermissions>> {
  if (headers?.get(ADMIN_UI_CLIENT_HEADER) !== ADMIN_UI_CLIENT) return {};

  const repos = makeRepositories();
  const [adminScope, canCreatePublications] = await Promise.all([
    resolveAdminScope(repos, userId),
    canCreatePublication(repos, userId),
  ]);
  return { isOrgAdmin: adminScope?.kind === "org", canCreatePublications };
}
