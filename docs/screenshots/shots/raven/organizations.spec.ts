import { expect, test } from "@playwright/test";

import { HOST_ORG } from "#src/data";
import { ADMIN_STORAGE_STATE, ADMIN_UI_BASE_URL } from "#src/env";
import { shoot } from "#src/shoot";

test.use({ baseURL: ADMIN_UI_BASE_URL, storageState: ADMIN_STORAGE_STATE });

test("new organization", async ({ page }) => {
  await page.goto("/orgs");
  await page.getByRole("button", { name: "+ New Organization" }).click();
  const panel = page.getByRole("dialog", { name: "New organization" });
  await expect(panel.getByText("DOI Minting")).toBeVisible();
  await shoot(page, "raven/organizations--new-organization", {
    target: panel,
  });
});

test("organization page", async ({ page }) => {
  await page.goto(`/orgs/${HOST_ORG.slug}`);
  await expect(
    page.getByRole("button", { name: "+ Add member" })
  ).toBeVisible();
  await shoot(page, "raven/organizations--organization-page", {
    target: page.locator("main > div > div"),
    // The slug line also shows the org's creation date.
    hide: [page.locator("p", { hasText: "· Created" })],
  });
});
