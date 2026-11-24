import { expect, test as setup, type Page } from "@playwright/test";

import { signIn } from "#src/auth";
import {
  COMMENTS_SLUG,
  CONTRIBUTOR_ROLE,
  CREATOR_ORG,
  DRAFT_SLUG,
  HOST_ORG,
  PUB_TYPE_TAG,
  PUBLICATION_SLUG,
  PUBTEMPLATE_URL,
  USER_DISPLAY_NAME,
} from "#src/data";
import {
  ADMIN,
  ADMIN_STORAGE_STATE,
  ADMIN_UI_BASE_URL,
  STACKS_BASE_URL,
  USER,
  USER_STORAGE_STATE,
} from "#src/env";
import { ensureMember, ensureOrg } from "#src/orgs";
import { expectReadyToRelease, findOwnPublication } from "#src/publications";

// Every step checks first and skips if it is already done, so a rerun
// against the same deployment changes nothing.

setup("seed orgs and memberships as the admin", async ({ playwright }) => {
  const admin = await playwright.request.newContext({
    baseURL: STACKS_BASE_URL,
    extraHTTPHeaders: { Origin: STACKS_BASE_URL },
  });
  try {
    await signIn(admin, ADMIN);
    await ensureOrg(admin, HOST_ORG);
    await ensureMember(admin, HOST_ORG.slug, USER.username);
    await ensureMember(admin, CREATOR_ORG.slug, USER.username);
  } finally {
    await admin.dispose();
  }
});

setup("sign in as the test user", async ({ page }) => {
  await signIn(page.request, USER);
  await page.goto("/publications/new");
  await expect(
    page.getByRole("button", { name: USER_DISPLAY_NAME })
  ).toBeVisible();
  await page.context().storageState({ path: USER_STORAGE_STATE });
});

// The admin UI is only for site and org admins, so the Raven shots are taken
// as the admin.
setup("sign in as the admin", async ({ page }) => {
  await signIn(page.request, ADMIN);
  await page.goto(`${ADMIN_UI_BASE_URL}/orgs`);
  await expect(
    page.getByRole("heading", { name: "Organizations" })
  ).toBeVisible();
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});

interface DraftState {
  slug: string;
  tags: string[];
  orgs: { name: string }[];
  contributors: { firstName: string; lastName: string; inByline: boolean }[];
}

function isTestUser(contributor: DraftState["contributors"][number]) {
  return (
    `${contributor.firstName} ${contributor.lastName}` === USER_DISPLAY_NAME
  );
}

async function fetchDraft(page: Page, id: string): Promise<DraftState> {
  const response = await page.request.get(
    `/api/v1/publications/id/${id}/draft`
  );
  expect(response.ok(), await response.text()).toBe(true);
  const { publication } = (await response.json()) as {
    publication: DraftState;
  };
  return publication;
}

async function expectImportSettled(page: Page, importId: string) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/v1/imports/${importId}`);
        expect(response.ok(), await response.text()).toBe(true);
        return ((await response.json()) as { settled: boolean }).settled;
      },
      { timeout: 120_000 }
    )
    .toBe(true);
}

/**
 * Imports the PubTemplate doc through the new creation flow
 * (`/publications/new`) and fills in its Details, the way an author would.
 * Skips whatever is already done. Returns the publication's id.
 */
async function importAndDescribe(page: Page, slug: string): Promise<string> {
  const existing = await findOwnPublication(page.request, slug);
  let id = existing?.id;
  let importId: string | undefined;
  if (id) {
    await page.goto(`/publications/${id.toLowerCase()}/edit`);
  } else {
    await page.goto("/publications/new");
    await page.getByLabel("Google Docs URL").fill(PUBTEMPLATE_URL);
    const imported = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/imports"
    );
    await page.getByRole("button", { name: "Import" }).click();
    ({ importId } = (await (await imported).json()) as { importId: string });
    await page.waitForURL(/\/publications\/[0-9a-z]+\/edit$/, {
      timeout: 120_000,
    });
    id = page.url().split("/").at(-2)!.toUpperCase();
  }

  const slugField = page.locator("#newpub_slug").getByRole("textbox");
  await expect(slugField).not.toHaveValue("");
  const draft = await fetchDraft(page, id);

  if (!draft.contributors.some(isTestUser)) {
    const contributors = page.locator("#newpub_contributors");
    await contributors.getByRole("button", { name: "Add contributor" }).click();
    // The new row saves as soon as the roles picker closes, so the byline
    // has to be set before a user is picked.
    await contributors
      .getByRole("switch", { name: "Show the new contributor in the byline" })
      .click();
    await contributors
      .getByRole("combobox", { name: /Search contributors/ })
      .fill(USER.username);
    await page
      .getByRole("option", { name: new RegExp(USER_DISPLAY_NAME) })
      .click();
    await page.getByRole("checkbox", { name: CONTRIBUTOR_ROLE }).check();
    await page.keyboard.press("Escape");
  }

  if (!draft.orgs.some((org) => org.name === HOST_ORG.name)) {
    await page.locator("#newpub_orgs").getByRole("combobox").click();
    await page.getByRole("option", { name: HOST_ORG.name }).click();
  }

  if (!draft.tags.includes(PUB_TYPE_TAG)) {
    await page
      .locator("#newpub_tags")
      .getByRole("button", { name: "Choose a pub type" })
      .click();
    await page
      .getByRole("list", { name: "Pub types" })
      .getByRole("button", { name: PUB_TYPE_TAG })
      .click();
  }

  if (draft.slug !== slug) await slugField.fill(slug);

  // Edits save in the background, so wait until the API has all of them.
  await expect
    .poll(async () => {
      const saved = await fetchDraft(page, id);
      return {
        slug: saved.slug,
        tagged: saved.tags.includes(PUB_TYPE_TAG),
        hosted: saved.orgs.some((org) => org.name === HOST_ORG.name),
        byline: saved.contributors.some((c) => isTestUser(c) && c.inByline),
      };
    })
    .toEqual({ slug, tagged: true, hosted: true, byline: true });

  // The figures keep importing in the background, and the backend refuses to
  // release until they settle, even though the Release button is enabled.
  if (importId) await expectImportSettled(page, importId);

  return id;
}

async function ensureReleased(page: Page, slug: string): Promise<void> {
  const existing = await findOwnPublication(page.request, slug);
  if (existing?.state === "PUBLISHED") return;

  await importAndDescribe(page, slug);
  await expectReadyToRelease(page);
  await page.getByRole("button", { name: "Release publication…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Release publication" }).click();
  await page.waitForURL(`**/publications/${slug}`, { timeout: 60_000 });

  const released = await findOwnPublication(page.request, slug);
  expect(released?.state).toBe("PUBLISHED");
}

setup.describe(() => {
  setup.use({ storageState: USER_STORAGE_STATE });

  setup("release the example publication", async ({ page }) => {
    setup.setTimeout(180_000);
    await ensureReleased(page, PUBLICATION_SLUG);
  });

  setup("release the comments publication", async ({ page }) => {
    setup.setTimeout(180_000);
    await ensureReleased(page, COMMENTS_SLUG);
  });

  setup("prepare the unreleased draft", async ({ page }) => {
    setup.setTimeout(180_000);
    await importAndDescribe(page, DRAFT_SLUG);
  });
});
