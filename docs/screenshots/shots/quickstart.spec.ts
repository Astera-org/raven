import { expect, test, type Page } from "@playwright/test";

import { DRAFT_SLUG, PUBTEMPLATE_URL } from "#src/data";
import { relativeTimes } from "#src/dates";
import { editPagePath, expectReadyToRelease } from "#src/publications";
import { shoot } from "#src/shoot";

// One shot per step of the authors' quickstart, taken on the draft that
// seed.setup.ts leaves unreleased.

const CHANGE_PAGE_HEADER = "div.fixed.top-0";

async function openDraft(page: Page) {
  await page.goto(await editPagePath(page.request, DRAFT_SLUG));
  await expect(page.locator("#newpub_slug").getByRole("textbox")).toHaveValue(
    DRAFT_SLUG
  );
}

async function shootRow(page: Page, selector: string, name: string) {
  await openDraft(page);
  await shoot(page, name, {
    target: page.locator(selector),
    hide: [CHANGE_PAGE_HEADER, relativeTimes(page)],
  });
}

test("quickstart import", async ({ page }) => {
  await page.goto("/publications/new");
  const form = page.locator("form").filter({
    has: page.getByLabel("Google Docs URL"),
  });
  await form.getByLabel("Google Docs URL").fill(PUBTEMPLATE_URL);
  await expect(form.getByRole("button", { name: "Import" })).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Your unfinished Pubs" })
  ).toBeVisible();
  await shoot(page, "stacks/quickstart--import-google-doc", {
    fullPage: true,
    hide: [relativeTimes(page)],
  });
});

// The fields after Community are hidden so the shot shows only the ones the
// quickstart covers.
const FIELDS_AFTER_COMMUNITY = [
  "#newpub_tags",
  "#newpub_slug",
  "#newpub_doi",
  "#newpub_linked_assets",
  "#newpub_feedback_form_embed_src",
  "#newpub_social_posts_embed_src",
];

test("quickstart details", async ({ page }) => {
  await openDraft(page);
  const details = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Details", level: 2, exact: true }),
  });
  await shoot(page, "stacks/quickstart--details", {
    target: details,
    hide: [CHANGE_PAGE_HEADER, relativeTimes(page)],
    css: `${FIELDS_AFTER_COMMUNITY.join(", ")} { display: none !important; }`,
  });
});

test("quickstart contributors", async ({ page }) => {
  await shootRow(
    page,
    // The contributors table has negative side margins and overflows its row.
    "#newpub_contributors > div",
    "stacks/quickstart--contributors"
  );
});

test("quickstart community", async ({ page }) => {
  await shootRow(page, "#newpub_orgs", "stacks/quickstart--community");
});

test("quickstart license", async ({ page }) => {
  await shootRow(page, "#newpub_license", "stacks/quickstart--license");
});

test("quickstart release bar", async ({ page }) => {
  await openDraft(page);
  await expectReadyToRelease(page);
  const bar = page.locator("div.rounded-xl").filter({
    has: page.getByRole("heading", { name: "Ready to release?" }),
  });
  await shoot(page, "stacks/quickstart--release-bar", {
    target: bar,
    hide: [CHANGE_PAGE_HEADER],
  });
});

test("quickstart release dialog", async ({ page }) => {
  await openDraft(page);
  await expectReadyToRelease(page);
  await page.getByRole("button", { name: "Release publication…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "Release publication" })
  ).toBeEnabled();
  // Only the screenshot: the draft must stay unreleased.
  await shoot(page, "stacks/quickstart--release-dialog", { target: dialog });
});
