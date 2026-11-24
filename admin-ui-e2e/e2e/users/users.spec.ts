import { expect, test } from "@playwright/test";

import { fetchCurrentUser } from "#src/utils";

test("users list search + pagination, and detail page sections", async ({
  page,
}) => {
  const admin = await fetchCurrentUser(page.request);
  const adminFullName = `${admin.firstName} ${admin.lastName}`;

  await page.goto("/users");
  const resultsSummary = page.getByText(/page \d+ of \d+/);
  await expect(resultsSummary).toBeVisible();
  // Assumes the DB has at least 11 total users (true for this shared dev DB;
  // 10 fills exactly one page). A freshly seeded DB has only the admin, so
  // this fails there -- CI or a fresh setup would need 10+ users seeded first.
  const nextButton = page.getByRole("button", { name: "Next >" });
  await expect(nextButton).toBeEnabled();

  const rowLinks = page.locator("tbody a");
  const rowsBefore = await rowLinks.allTextContents();
  await nextButton.click();
  await expect(page.getByText(/page 2 of \d+/)).toBeVisible();
  // The label updates from local state immediately on click, but the rows
  // come from a still-in-flight fetch -- poll instead of reading them once.
  await expect.poll(() => rowLinks.allTextContents()).not.toEqual(rowsBefore);

  const totalUsers = async () => {
    const text = (await resultsSummary.textContent()) ?? "";
    return Number(text.match(/^(\d+) users/)?.[1] ?? NaN);
  };
  const beforeSearch = await totalUsers();

  await page
    .getByPlaceholder("Search by name, username, or email")
    .fill(admin.username);

  // A broken search would leave the count (and this row's visibility)
  // unaffected by what we typed, so assert the results actually narrowed.
  await expect.poll(totalUsers).toBeLessThan(beforeSearch);

  const adminRow = page.getByRole("link").filter({ hasText: adminFullName });
  await expect(adminRow).toBeVisible();
  await adminRow.click();
  await expect(page).toHaveURL(`/users/${admin.id}`);

  // Profile.
  await expect(
    page.getByRole("heading", { name: adminFullName })
  ).toBeVisible();

  // Orgs.
  await expect(page.getByText("Organizations and Roles")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Default Organization" })
  ).toBeVisible();

  // Publications tab is the default; switch to Comments.
  await expect(page.getByText("No publications found")).toBeVisible();
  await page.getByRole("button", { name: /^Comments/ }).click();
  await expect(page.getByText("No comments found")).toBeVisible();
});
