import { expect, type APIRequestContext, type Page } from "@playwright/test";

export interface OwnPublication {
  id: string;
  state: string;
}

/**
 * Finds one of the signed-in user's publications by slug, whether it is an
 * unreleased draft or released. Returns null if there is none.
 */
export async function findOwnPublication(
  request: APIRequestContext,
  slug: string
): Promise<OwnPublication | null> {
  const drafts = await request.get(
    "/api/v1/users/me/publications?state=draft&perPage=100"
  );
  expect(drafts.ok(), await drafts.text()).toBe(true);
  const { items } = (await drafts.json()) as {
    items: { publicationId: string; slug: string; state: string }[];
  };
  const draft = items.find((item) => item.slug === slug);
  if (draft) return { id: draft.publicationId, state: draft.state };

  const released = await request.get(`/api/v1/publications/p/${slug}`);
  if (released.status() === 404) return null;
  expect(released.ok(), await released.text()).toBe(true);
  const { publication } = (await released.json()) as {
    publication: OwnPublication;
  };
  return publication;
}

/** The new creation flow's edit page for a publication. */
export async function editPagePath(
  request: APIRequestContext,
  slug: string
): Promise<string> {
  const publication = await findOwnPublication(request, slug);
  if (!publication) throw new Error(`No publication with slug "${slug}".`);
  return `/publications/${publication.id.toLowerCase()}/edit`;
}

/**
 * Waits until the /edit page allows releasing: the release button is
 * enabled and there is no list of things to fix.
 */
export async function expectReadyToRelease(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: "Release publication…" })
  ).toBeEnabled();
  await expect(page.getByText(/to fix before releasing/)).toHaveCount(0);
}
