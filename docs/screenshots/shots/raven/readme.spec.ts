import { expect, test } from "@playwright/test";

import { HOST_ORG } from "#src/data";
import { ADMIN_STORAGE_STATE, ADMIN_UI_BASE_URL } from "#src/env";
import { shoot } from "#src/shoot";

// The README's hero image. It is copied by hand to .github/images/ and
// committed, so it is taken at 1x to stay small.
test.use({
  baseURL: ADMIN_UI_BASE_URL,
  storageState: ADMIN_STORAGE_STATE,
  deviceScaleFactor: 1,
});

test("readme admin UI", async ({ page }) => {
  await page.goto(`/orgs/${HOST_ORG.slug}`);
  await expect(
    page.getByRole("button", { name: "+ Add member" })
  ).toBeVisible();
  await shoot(page, "raven/readme--admin-ui", {
    hide: [page.locator("p", { hasText: "· Created" })],
  });
});
