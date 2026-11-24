import { expect, test, type Page } from "@playwright/test";

import { DRAFT_SLUG } from "#src/data";
import { relativeTimes } from "#src/dates";
import { editPagePath, expectReadyToRelease } from "#src/publications";
import { shoot } from "#src/shoot";

// These shots use the new creation flow (/publications/new and
// /publications/<id>/edit), and the draft that seed.setup.ts leaves
// unreleased.

// The /edit page's header is fixed to the top and would cover the top of
// whichever section is shot.
const CHANGE_PAGE_HEADER = "div.fixed.top-0";

function section(page: Page, heading: string) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: heading, level: 2, exact: true }),
  });
}

async function openDraft(page: Page) {
  await page.goto(await editPagePath(page.request, DRAFT_SLUG));
  await expect(page.locator("#newpub_slug").getByRole("textbox")).toHaveValue(
    DRAFT_SLUG
  );
}

test("import from Google Docs", async ({ page }) => {
  await page.goto("/publications/new");
  const form = page.locator("form").filter({
    has: page.getByLabel("Google Docs URL"),
  });
  await expect(form.getByRole("button", { name: "Import" })).toBeVisible();
  await shoot(page, "stacks/creating-a-publication--import-google-doc", {
    target: form,
  });
});

test("unfinished pubs", async ({ page }) => {
  await page.goto("/publications/new");
  const card = page.getByRole("region", { name: "Your unfinished Pubs" });
  await expect(card.getByRole("link")).not.toHaveCount(0);
  await shoot(page, "stacks/creating-a-publication--unfinished-pubs", {
    target: card,
    hide: [relativeTimes(page)],
  });
});

test("imported content", async ({ page }) => {
  await openDraft(page);
  await shoot(page, "stacks/creating-a-publication--imported-content", {
    target: section(page, "Content"),
    hide: [CHANGE_PAGE_HEADER, relativeTimes(page)],
  });
});

test("publication fields", async ({ page }) => {
  await openDraft(page);
  await shoot(page, "stacks/creating-a-publication--publication-fields", {
    target: section(page, "Details"),
    hide: [CHANGE_PAGE_HEADER, relativeTimes(page)],
  });
});

test("release", async ({ page }) => {
  await openDraft(page);
  await expectReadyToRelease(page);
  await page.getByRole("button", { name: "Release publication…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toBeVisible();
  // Only the screenshot: the draft must stay unreleased.
  await shoot(page, "stacks/creating-a-publication--release", {
    target: dialog,
  });
});
