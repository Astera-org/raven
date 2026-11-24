import { expect, test } from "@playwright/test";

import { USER_DISPLAY_NAME } from "#src/data";
import { relativeTimes } from "#src/dates";
import { ADMIN_STORAGE_STATE, ADMIN_UI_BASE_URL } from "#src/env";
import { shoot } from "#src/shoot";

test.use({ baseURL: ADMIN_UI_BASE_URL, storageState: ADMIN_STORAGE_STATE });

test("users list", async ({ page }) => {
  await page.goto("/users");
  await expect(page.getByText(USER_DISPLAY_NAME)).toBeVisible();
  await shoot(page, "raven/users--list", {
    target: page.locator("main > div > div"),
    hide: [relativeTimes(page)],
  });
});
