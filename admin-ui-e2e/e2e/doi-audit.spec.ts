import { expect, test } from "@playwright/test";

test("DOI audit page loads with tabs, Run button, and description", async ({
  page,
}) => {
  await page.goto("/doi-audit");

  await expect(
    page.getByRole("heading", { name: "DOI Metadata Check", level: 1 })
  ).toBeVisible();

  const canonicalTab = page.getByRole("button", {
    name: "Canonical DOIs",
    exact: true,
  });
  const versionTab = page.getByRole("button", {
    name: "Version DOIs",
    exact: true,
  });
  await expect(canonicalTab).toBeVisible();
  await expect(versionTab).toBeVisible();

  const cardHeading = page.getByRole("heading", { level: 2 });
  // Card container: the smallest element wrapping the heading, description,
  // and scope line -- scopes the description assertions below to the card
  // instead of matching "DataCite" anywhere on the page.
  const card = cardHeading.locator("..");

  // CARD_COPY in admin-ui/app/routes/doi-audit.tsx -- headings and the
  // description's opening clause are stable; the "Fields checked: ..." list
  // that follows is tunable, so it's excluded.
  await expect(cardHeading).toHaveText("Compare canonical DOI metadata");
  await expect(
    card.getByText(
      /canonical \(concept\) DOI record on The Stacks against DataCite/
    )
  ).toBeVisible();

  await versionTab.click();
  await expect(cardHeading).toHaveText("Compare version DOI metadata");
  await expect(
    card.getByText(
      /latest published version's DOI record on The Stacks against DataCite/
    )
  ).toBeVisible();

  await canonicalTab.click();
  await expect(cardHeading).toHaveText("Compare canonical DOI metadata");

  const runButton = page.getByRole("button", { name: "Run comparison" });
  await expect(runButton).toBeVisible();
  await expect(runButton).toBeEnabled();
});
