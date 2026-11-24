import { type Test } from "supertest";
import { expect, it } from "vitest";
import {
  ADMIN_FORBIDDEN,
  endMembership,
  execute,
  loggedInUser,
  type RouteCase,
  seedOrgMember,
  TestApiClient,
  UNAUTHENTICATED,
} from "./helpers.js";

export type AdminGateTarget<Target> = {
  /** The org whose memberships the gate seeds for each rejected caller. */
  org: { orgIdInt: number };
  target: Target;
  /** Asserts the rejected request left the target unchanged. */
  expectUntouched?: () => Promise<void>;
};

/**
 * Registers the checks every /api/v1/admin route shares: signed-out callers
 * get 401, and anyone who isn't currently an active admin gets 403.
 */
export function itEnforcesAdminGate<Target>(
  routes: RouteCase<Target>[],
  seedTarget: () => Promise<AdminGateTarget<Target>>
): void {
  it.each(routes)("$name requires authentication", async (route) => {
    const { target, expectUntouched } = await seedTarget();

    const resp = await route.send(new TestApiClient(), target);
    expect(resp.status).toBe(401);
    expect(resp.body).toEqual(UNAUTHENTICATED);
    await expectUntouched?.();
  });

  it.each(routes)("$name forbids a plain member of the org", async (route) => {
    const { org, target, expectUntouched } = await seedTarget();
    const { client, userIds } = await loggedInUser("plainmember");
    await seedOrgMember(org.orgIdInt, userIds);

    await expectForbidden(route.send(client, target), expectUntouched);
  });

  it.each(routes)(
    "$name forbids a moderated user even with an active admin membership",
    async (route) => {
      const { org, target, expectUntouched } = await seedTarget();
      const { client, userId, userIds } = await loggedInUser("moderated");
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
      await execute(
        `UPDATE users SET state = 'MODERATED' WHERE id_int = ${userId}`
      );

      await expectForbidden(route.send(client, target), expectUntouched);
    }
  );

  it.each(routes)(
    "$name forbids a user whose only admin membership has ended",
    async (route) => {
      const { org, target, expectUntouched } = await seedTarget();
      const { client, userIds } = await loggedInUser("formeradmin");
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
      await endMembership(org, userIds);

      await expectForbidden(route.send(client, target), expectUntouched);
    }
  );

  it.each(routes)(
    "$name forbids a user whose only admin membership hasn't started",
    async (route) => {
      const { org, target, expectUntouched } = await seedTarget();
      const { client, userIds } = await loggedInUser("futureadmin");
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
      await execute(
        `UPDATE org_user_map SET start_at = NOW() + INTERVAL 1 DAY WHERE org_id_int = ${org.orgIdInt} AND user_id_int = ${userIds.id_int}`
      );

      await expectForbidden(route.send(client, target), expectUntouched);
    }
  );

  it.each(routes)(
    "$name forbids a user whose only admin membership is in a deleted org",
    async (route) => {
      const { org, target, expectUntouched } = await seedTarget();
      const { client, userIds } = await loggedInUser("deletedorgadmin");
      await seedOrgMember(org.orgIdInt, userIds, "ADMIN");
      await execute(
        `UPDATE organizations SET state = 'DELETED' WHERE id_int = ${org.orgIdInt}`
      );

      await expectForbidden(route.send(client, target), expectUntouched);
    }
  );
}

async function expectForbidden(
  request: Test,
  expectUntouched?: () => Promise<void>
) {
  const resp = await request;
  expect(resp.status).toBe(403);
  expect(resp.body).toEqual(ADMIN_FORBIDDEN);
  await expectUntouched?.();
}
