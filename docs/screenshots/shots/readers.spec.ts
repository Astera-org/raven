import { expect, test, type Page } from "@playwright/test";

import {
  COMMENTS_SLUG,
  EXAMPLE_ORCID,
  HOST_ORG,
  PUBLICATION_SLUG,
  USER_DISPLAY_NAME,
} from "#src/data";
import { dates, relativeTimes } from "#src/dates";
import { USER } from "#src/env";
import { shoot } from "#src/shoot";

test("publication page", async ({ page }) => {
  await page.goto(`/publications/${PUBLICATION_SLUG}`);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await shoot(page, "stacks/readers--publication-page", {
    hide: [dates(page)],
  });
});

test("version view", async ({ page }) => {
  await page.goto(`/publications/${PUBLICATION_SLUG}/1`);
  await expect(page.getByText("Version 1").first()).toBeVisible();
  await shoot(page, "stacks/readers--version-view", { hide: [dates(page)] });
});

test("user page", async ({ page }) => {
  await page.goto(`/users/${USER.username}`);
  await expect(page.getByText(USER_DISPLAY_NAME).first()).toBeVisible();
  await shoot(page, "stacks/readers--user-page", { hide: [dates(page)] });
});

test("organization page", async ({ page }) => {
  await page.goto(`/organizations/${HOST_ORG.slug}`);
  await expect(page.getByText(HOST_ORG.name).first()).toBeVisible();
  await shoot(page, "stacks/readers--organization-page", {
    hide: [dates(page)],
  });
});

// Linking an ORCID iD is an OAuth round trip through orcid.org, which the
// screenshot deployment is not configured for. The linked state is shown by
// adding the example iD to the user the frontend fetches.
async function fakeLinkedOrcid(page: Page) {
  await page.route("**/auth/me", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, user: { ...body.user, orcid: EXAMPLE_ORCID } },
    });
  });
}

async function openProfileSettings(page: Page) {
  await page.goto("/account/settings#profile");
  const form = page.locator("form").filter({
    has: page.getByText("Information on your public profile"),
  });
  await expect(form.getByLabel("First name")).toHaveValue("Ada");
  return form;
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("log in button", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "Log in" })).toBeVisible();
    await shoot(page, "stacks/readers--log-in-button", { target: header });
  });
});

test("link ORCID button", async ({ page }) => {
  const form = await openProfileSettings(page);
  await expect(
    form.getByRole("button", { name: "Link ORCID iD" })
  ).toBeVisible();
  await shoot(page, "stacks/readers--link-orcid-button", { target: form });
});

test("profile settings page", async ({ page }) => {
  const form = await openProfileSettings(page);
  await expect(
    form.getByRole("button", { name: "Link ORCID iD" })
  ).toBeVisible();
  await shoot(page, "stacks/readers--profile-settings-page", {
    fullPage: true,
  });
});

test("linked ORCID", async ({ page }) => {
  await fakeLinkedOrcid(page);
  const form = await openProfileSettings(page);
  await expect(
    form.getByTitle(`View ORCID profile: ${EXAMPLE_ORCID}`)
  ).toBeVisible();
  await shoot(page, "stacks/readers--orcid-linked", { target: form });
});

test("ORCID badge", async ({ page }) => {
  await fakeLinkedOrcid(page);
  await page.goto("/account/settings");
  const header = page.locator("div.overflow-clip").filter({
    has: page.getByRole("heading", { level: 1, name: USER_DISPLAY_NAME }),
  });
  await expect(
    header.getByTitle(`View ORCID profile: ${EXAMPLE_ORCID}`)
  ).toBeVisible();
  await shoot(page, "stacks/readers--orcid-badge", { target: header });
});

const COMMENT_BODY =
  "Could you share the raw data behind the first figure? It would help to see the variance across replicates.";
const EDITED_COMMENT_BODY =
  "Could you share the raw data behind the first figure? Seeing the variance across all three replicates would make the result easier to judge.";

// The comment and the form sit flush with the section's edges, so the crops
// get some breathing room.
function padded(selector: string): string {
  return `${selector} { padding: 16px; }`;
}

// Every run posts a new comment, then edits and withdraws it, so each shot is
// cropped to that one comment and never shows the ones from earlier runs.
test("commenting", async ({ page }) => {
  await page.goto(`/publications/${COMMENTS_SLUG}#comments`);
  const form = page.getByTestId("new-comment-form");
  const formEditor = form.locator("[contenteditable=true]");
  await formEditor.click();
  await formEditor.pressSequentially(COMMENT_BODY);
  const submit = form.getByRole("button", { name: "Submit" });
  await expect(submit).toBeEnabled();
  await shoot(page, "stacks/readers--comment-form", {
    target: form,
    css: padded('[data-testid="new-comment-form"]'),
  });

  const posted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/comments/publication/")
  );
  await submit.click();
  const { comment_id: commentId } = (await (await posted).json()) as {
    comment_id: number;
  };
  const commentSelector = `[data-comment-id="${commentId}"] > div:first-child`;
  const comment = page.locator(commentSelector);
  const commentShot = {
    target: comment,
    hide: [relativeTimes(page)],
    css: padded(commentSelector),
  };
  await expect(comment.getByText(COMMENT_BODY)).toBeVisible();
  await expect(comment.getByText("Editable for")).toBeVisible();
  await shoot(page, "stacks/readers--comment-posted", commentShot);

  await comment.getByTestId("comment-menu-button").click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /^Edit/ })).toBeVisible();
  // The menu is portalled to the body, but it overlaps the comment, so a
  // crop to the comment still includes it.
  await shoot(page, "stacks/readers--comment-menu", commentShot);

  await menu.getByRole("menuitem", { name: /^Edit/ }).click();
  const editEditor = comment.locator("[contenteditable=true]");
  await editEditor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await editEditor.pressSequentially(EDITED_COMMENT_BODY);
  const save = comment.getByRole("button", { name: "Save" });
  await expect(save).toBeEnabled();
  await shoot(page, "stacks/readers--comment-editing", commentShot);

  await save.click();
  await expect(comment.getByText(EDITED_COMMENT_BODY)).toBeVisible();

  await comment.getByTestId("comment-menu-button").click();
  await page.getByRole("menuitem", { name: "Withdraw" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Withdrawal confirmation").fill("WITHDRAW");
  const confirm = dialog.getByRole("button", { name: "Withdraw comment" });
  await expect(confirm).toBeEnabled();
  await shoot(page, "stacks/readers--comment-withdraw-dialog", {
    target: dialog,
  });

  await confirm.click();
  await expect(
    comment.getByText("Comment has been withdrawn by the author")
  ).toBeVisible();
  await shoot(page, "stacks/readers--comment-withdrawn", commentShot);
});

// The screenshot deployment has no other users to reply to the test user's
// comments, so the list is faked with replies from example readers.
const REPLY_NOTIFICATIONS = [
  {
    first_name: "Grace",
    last_name: "Example",
    excerpt:
      "Seconding this. The replicate variance would also help compare the result with the second figure.",
    seen: 0,
  },
  {
    first_name: "Alan",
    last_name: "Example",
    excerpt:
      "We have uploaded the raw data for all three replicates to the linked repository.",
    seen: 0,
  },
  {
    first_name: "Grace",
    last_name: "Example",
    excerpt: "Thanks, the variance is much clearer now.",
    seen: 1,
  },
].map(({ first_name, last_name, excerpt, seen }, index) => ({
  id: index + 1,
  user_id: 2,
  publication_id: 3,
  publication_slug: COMMENTS_SLUG,
  publication_title: "**Pub Template**: _markdown allowed_",
  comment_id: index + 1,
  comment_author: { first_name, last_name, avatar: null },
  comment_text_excerpt: excerpt,
  comment_state: "PUBLISHED",
  publication_org: null,
  state: "REPLY",
  message: "New reply to your comment",
  seen,
  created_at: "2026-01-01T12:00:00.000Z",
}));

async function fakeReplyNotifications(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith("/api/notifications"),
    (route) =>
      route.fulfill({
        json: {
          pagination: {
            total: REPLY_NOTIFICATIONS.length,
            page: 1,
            per_page: 9,
          },
          items: REPLY_NOTIFICATIONS,
        },
      })
  );
  await page.route("**/api/notifications/types", (route) =>
    route.fulfill({ json: ["REPLY"] })
  );
}

test("notifications", async ({ page }) => {
  await fakeReplyNotifications(page);
  await page.goto("/account/notifications");
  const list = page.locator("main ul").filter({ has: page.locator("article") });
  await expect(list.locator("article")).toHaveCount(REPLY_NOTIFICATIONS.length);
  await shoot(page, "stacks/readers--notifications", {
    fullPage: true,
    hide: [page.locator("article time")],
  });
});

test("notification settings", async ({ page }) => {
  await page.goto("/account/settings#notifications");
  const section = page
    .getByRole("heading", { level: 3, name: "Notifications" })
    .locator("..");
  await expect(section.getByText("In-app")).toBeVisible();
  await shoot(page, "stacks/readers--notification-settings", {
    target: section,
  });
});
