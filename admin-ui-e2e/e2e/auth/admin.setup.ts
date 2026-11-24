import { test as setup } from "@playwright/test";

import { authenticateAdmin } from "#src/utils";

const authFile = "playwright/.auth/admin.json";

setup("authenticate as admin", async ({ page }) => {
  await authenticateAdmin(page.request);
  await page.goto("/dashboard");
  // The URL alone isn't proof: goto() lands here before the SPA's auth
  // check runs, and an invalid session would redirect away shortly after.
  // This heading only renders once _layout.tsx confirms the user and
  // renders the Outlet, so waiting for it proves the session actually held.
  await page
    .getByRole("heading", { name: "Welcome to the Admin Console" })
    .waitFor();
  await page.context().storageState({ path: authFile });
});
