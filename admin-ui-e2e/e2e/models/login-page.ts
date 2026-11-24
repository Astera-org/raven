import type { Locator, Page } from "@playwright/test";

import { settle } from "#src/utils";

/** Page object for admin-ui/app/routes/login.tsx. */
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator("#username");
    this.passwordInput = page.locator("#password");
    this.submitButton = page.getByRole("button", { name: /log in/i });
  }

  async goto(): Promise<void> {
    await this.page.goto("/login");
    await settle(this.page);
  }

  /**
   * Fills and submits the login form. A successful submit does a hard reload
   * (window.location.replace) rather than a client-side navigation — see
   * admin-ui/app/routes/login.tsx — so wait for the resulting page load, not
   * just a DOM change.
   */
  async login(usernameOrEmail: string, password: string): Promise<void> {
    await this.usernameInput.fill(usernameOrEmail);
    await this.passwordInput.fill(password);
    await Promise.all([
      this.page.waitForURL(/\/dashboard/),
      this.submitButton.click(),
    ]);
    await settle(this.page);
  }
}
