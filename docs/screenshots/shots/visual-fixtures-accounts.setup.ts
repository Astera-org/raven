import {
  expect,
  test as setup,
  type PlaywrightWorkerArgs,
} from "@playwright/test";

import { newApiContext, signIn } from "#src/auth";
import { ADMIN } from "#src/env";
import { ensureMember, ensureOrg } from "#src/orgs";
import {
  FIXTURE_ORG,
  FIXTURE_USER_PASSWORD,
  FIXTURE_USERS,
  fixtureCredentials,
  OWNER,
  SELF_MINTING_ORG,
  type FixtureUser,
} from "#src/visual-fixtures";

// The users and orgs the visual regression fixtures need, seeded before
// visual-fixtures.setup.ts releases the publications. Like that file, every
// step checks first, so a rerun changes nothing.

/** Signs the user up, unless they can already sign in. */
async function ensureUser(
  playwright: PlaywrightWorkerArgs["playwright"],
  user: FixtureUser
): Promise<void> {
  const request = await newApiContext(playwright);
  try {
    const signedIn = await request.post("/api/auth2/sign-in/username", {
      data: fixtureCredentials(user),
    });
    if (signedIn.ok()) return;

    const signedUp = await request.post("/api/auth2/sign-up/email", {
      data: {
        ...user,
        name: `${user.firstName} ${user.lastName}`,
        password: FIXTURE_USER_PASSWORD,
      },
    });
    expect(signedUp.ok(), await signedUp.text()).toBe(true);
  } finally {
    await request.dispose();
  }
}

setup("seed the fixture users and org as the admin", async ({ playwright }) => {
  for (const user of FIXTURE_USERS) await ensureUser(playwright, user);

  const admin = await newApiContext(playwright);
  try {
    await signIn(admin, ADMIN);
    await ensureOrg(admin, FIXTURE_ORG);
    await ensureOrg(admin, SELF_MINTING_ORG);
    await ensureMember(admin, SELF_MINTING_ORG.slug, OWNER.username);
    // Releasing a hosted publication requires its owner to be a member.
    await ensureMember(admin, FIXTURE_ORG.slug, OWNER.username);
  } finally {
    await admin.dispose();
  }
});
