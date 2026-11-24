import { expect, test } from "@playwright/test";

import { authenticateAdmin, settle } from "#src/utils";

test.describe("session", () => {
  test("persists across a page reload", async ({ page }) => {
    await page.goto("/dashboard");
    await page.reload();
    await settle(page);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("aside")).toBeVisible();
  });
});

test.describe("logout", () => {
  // Logging out revokes the session server-side. Reusing the shared
  // playwright/.auth/admin.json state here would knock out every other test
  // running in parallel against that same session, so this test signs in
  // fresh instead.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an authenticated admin can log out from the sidebar", async ({
    page,
  }) => {
    await authenticateAdmin(page.request);
    await page.goto("/dashboard");

    await page.locator("aside").getByRole("button").click();
    // Sidebar's logout does window.location.replace("/"), not /login.
    await Promise.all([
      page.waitForURL("/"),
      page.getByRole("menuitem", { name: "Log out" }).click(),
    ]);
    await expect(page).toHaveURL("/");

    // Confirm the session was actually cleared, not just the UI hidden.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
