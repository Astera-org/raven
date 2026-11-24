import { getConfig } from "#src/config.js";
import { type Repositories } from "#v1/db-repositories/index.js";

/**
 * Site admins, and ACTIVE users with a current membership in one of
 * `PUBLICATION_CREATOR_ORGS`. The admin UI's session reports the same
 * decision (see `lib/admin-ui-session.ts`).
 */
export async function canCreatePublication(
  repos: Repositories,
  userId: string
): Promise<boolean> {
  const userState = await repos.users.findState(userId);
  if (userState === "SITE_ADMIN") return true;
  if (userState !== "ACTIVE") return false;

  return repos.orgs.hasMembershipInOrgs(
    userId,
    getConfig().PUBLICATION_CREATOR_ORGS
  );
}
