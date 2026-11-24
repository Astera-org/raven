import { expect, test } from "@playwright/test";

import { fetchCurrentUser } from "#src/utils";

// Org seed-admin.ts creates for the admin (see this package's README).
const TEST_ORG_NAME = "Default Organization";
const TEST_ORG_SLUG = "default-organization";

test("org list opens detail, members/publications toggle, member links to user detail", async ({
  page,
}) => {
  const admin = await fetchCurrentUser(page.request);
  const adminFullName = `${admin.firstName} ${admin.lastName}`;

  await page.goto("/orgs");
  // Every cell in the org row is a link; its aria-label (not the visible
  // text) is the accessible name. See admin-ui/app/routes/orgs.tsx.
  await page
    .getByRole("link", {
      name: `View ${TEST_ORG_NAME} organization (${TEST_ORG_SLUG})`,
      exact: true,
    })
    .click();

  // Members tab is the default.
  const memberLink = page.getByRole("link").filter({ hasText: adminFullName });
  await expect(memberLink).toBeVisible();

  await page.getByRole("button", { name: /^Publications/ }).click();
  await expect(page.getByText("No publications found")).toBeVisible();

  await page.getByRole("button", { name: /^Members/ }).click();
  await memberLink.click();
  await expect(page).toHaveURL(`/users/${admin.id}`);
});
