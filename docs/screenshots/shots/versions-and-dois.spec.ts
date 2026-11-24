import { expect, test, type Page } from "@playwright/test";

import { PUBLICATION_SLUG } from "#src/data";
import { dates, relativeTimes } from "#src/dates";
import { shoot } from "#src/shoot";

const CHANGE_PAGE_HEADER = "div.fixed.top-0";

const VERSION_DESCRIPTION = "Corrected the growth rate units in Figure 2.";

test("version dropdown", async ({ page }) => {
  await page.goto(`/publications/${PUBLICATION_SLUG}`);
  const trigger = page.getByRole("button", { name: /^Version \d+/ });
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await shoot(page, "stacks/versions-and-dois--version-dropdown", {
    hide: [dates(page)],
  });
});

test("edit button", async ({ page }) => {
  await page.goto(`/publications/${PUBLICATION_SLUG}`);
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await shoot(page, "stacks/versions-and-dois--edit-button", {
    // The other .bg-pub-header is the fixed bar that appears on scroll.
    target: page.locator("div.bg-pub-header:not(.fixed)"),
    hide: [dates(page)],
  });
});

// Opening the editor creates the next version's draft, or reuses it on a
// rerun. The draft is never released, so docs-example keeps its versions.
async function openNewVersion(page: Page) {
  await page.goto(`/publications/${PUBLICATION_SLUG}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.waitForURL(/\/publications\/[^/]+\/edit$/);
  await expect(
    page.getByRole("button", { name: "Release new version…" })
  ).toBeEnabled();
}

async function fillVersionDescription(page: Page) {
  const section = page.locator("#newpub_versionDesc");
  await section.getByRole("textbox").fill(VERSION_DESCRIPTION);
  await expect(
    page.getByRole("button", { name: "Release new version…" })
  ).toBeEnabled();
  return section;
}

test("new version description", async ({ page }) => {
  await openNewVersion(page);
  const section = await fillVersionDescription(page);
  await shoot(page, "stacks/versions-and-dois--version-description", {
    target: section,
    hide: [CHANGE_PAGE_HEADER, relativeTimes(page)],
  });
});

test("new version release bar", async ({ page }) => {
  await openNewVersion(page);
  await fillVersionDescription(page);
  const bar = page.locator("div.rounded-xl").filter({
    has: page.getByRole("heading", { name: "Release a new version?" }),
  });
  await shoot(page, "stacks/versions-and-dois--release-bar", {
    target: bar,
    hide: [CHANGE_PAGE_HEADER],
  });
});

test("new version release dialog", async ({ page }) => {
  await openNewVersion(page);
  await fillVersionDescription(page);
  const dialog = page.getByRole("dialog");
  // The button stays enabled while the draft saves, and opens the dialog only
  // once the saved draft passes validation.
  await expect(async () => {
    await page.getByRole("button", { name: "Release new version…" }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expect(dialog.getByLabel("Release note")).toHaveValue(
    VERSION_DESCRIPTION
  );
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "Release new version" })
  ).toBeEnabled();
  // Only the screenshot: the new version must stay unreleased.
  await shoot(page, "stacks/versions-and-dois--release-dialog", {
    target: dialog,
  });
});
