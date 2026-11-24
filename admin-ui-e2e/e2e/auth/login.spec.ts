import { expect, test } from "@playwright/test";

import { LoginPage } from "#src/e2e/models/login-page";

test.describe("login form", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signs in with valid credentials and lands on /dashboard", async ({
    page,
  }) => {
    const username = process.env.TEST_ADMIN_USERNAME;
    const password = process.env.TEST_ADMIN_PASSWORD;
    test.skip(
      !username || !password,
      "TEST_ADMIN_USERNAME/PASSWORD not set (see .env.template)"
    );

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(username!, password!);

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("shows an error for invalid credentials", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.usernameInput.fill("not-a-real-user");
    await loginPage.passwordInput.fill("wrong-password");
    await loginPage.submitButton.click();

    // BetterAuth's fixed message for INVALID_USERNAME_OR_PASSWORD, not
    // tunable app copy -- stable enough to assert on directly.
    await expect(page.getByText("Invalid username or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
