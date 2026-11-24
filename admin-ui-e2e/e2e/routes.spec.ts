import { expect, test } from "@playwright/test";

import { authenticateAdmin } from "#src/utils";

// Top-level nav routes. The authenticated "loads" test below expects real
// content, so it's kept to routes reachable without a specific resource id.
const PROTECTED_ROUTES = ["/dashboard", "/orgs", "/users", "/doi-audit"];

// Asserts the auth gate only (loads, isn't bounced to /login); page content
// is covered by each route's own per-feature spec.
test.describe("protected routes (authenticated)", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} loads for a signed-in admin`, async ({ page }) => {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main")).toBeVisible();
    });
  }
});

// The orgs loaders' API calls reject with 401 before _layout.tsx's redirect
// runs, so these routes render the "Not signed in" error page in place.
const ERROR_PAGE_ROUTES = ["/orgs", "/orgs/default-organization"];
const REDIRECT_ROUTES = PROTECTED_ROUTES.filter(
  (route) => !ERROR_PAGE_ROUTES.includes(route)
);

test.describe("auth gate (signed out)", () => {
  // admin-ui/app/routes/_layout.tsx client-side redirects an unauthenticated
  // visitor to /login, so drive this describe block with no stored session.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of REDIRECT_ROUTES) {
    test(`${route} redirects a signed-out visitor to /login`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  // /orgs/default-organization is the slug seed-admin.ts always creates (see
  // this package's README).
  for (const route of ERROR_PAGE_ROUTES) {
    test(`${route} shows a signed-out visitor the sign-in error page`, async ({
      page,
    }) => {
      await page.goto(route);
      await expect(
        page.getByRole("heading", { name: "Not signed in" })
      ).toBeVisible();
      await expect(page).toHaveURL(route);

      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/login/);
    });
  }

  // Dynamic routes need a real id — a fake one 404s before the auth
  // redirect can run.

  test("/users/:id redirects a signed-out visitor to /login", async ({
    page,
    request,
  }) => {
    // `request` is isolated from `page` — just a lookup for a real id.
    const { id: realUserId } = await authenticateAdmin(request);

    await page.goto(`/users/${realUserId}`);
    await expect(page).toHaveURL(/\/login/);
  });

  // doi-audit/compare/:type/:doi: no seed script creates a real DOI.
});
