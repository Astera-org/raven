import { orgUserMap } from "#src/db/schema.js";
import { and, gt, isNull, lte, or, sql, type SQL } from "drizzle-orm";

export function activeMembership(): SQL | undefined {
  return or(isNull(orgUserMap.endAt), gt(orgUserMap.endAt, sql`NOW()`));
}

// Unlike general membership, rights granted by a membership (org admin,
// publication creation) also wait for `start_at`, matching v0's admin-panel
// checks.
export function currentMembership(): SQL | undefined {
  return and(
    activeMembership(),
    or(isNull(orgUserMap.startAt), lte(orgUserMap.startAt, sql`NOW()`))
  );
}

export function activeAdminMembership(): SQL | undefined {
  return and(
    currentMembership(),
    sql`find_in_set('ADMIN', ${orgUserMap.roles})`
  );
}
