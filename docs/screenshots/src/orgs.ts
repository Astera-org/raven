import { expect, type APIRequestContext } from "@playwright/test";

/** Creates the org as the admin, unless it exists. */
export async function ensureOrg(
  admin: APIRequestContext,
  org: { name: string; slug: string }
): Promise<void> {
  const existing = await admin.get(`/api/v1/orgs/${org.slug}`);
  if (existing.ok()) return;

  const created = await admin.post("/api/v1/orgs", {
    data: { name: org.name },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { slug } = (await created.json()) as { slug: string };
  expect(slug).toBe(org.slug);
}

/** Adds the user to the org as the admin, unless they are a member. */
export async function ensureMember(
  admin: APIRequestContext,
  orgSlug: string,
  username: string
): Promise<void> {
  const members = await admin.get(
    `/api/v1/orgs/${orgSlug}/members?perPage=100`
  );
  expect(members.ok(), await members.text()).toBe(true);
  const { items } = (await members.json()) as {
    items: { username: string | null }[];
  };
  if (items.some((member) => member.username === username)) return;

  const added = await admin.post(`/api/v1/admin/orgs/${orgSlug}/members`, {
    data: { username },
  });
  expect(added.ok(), await added.text()).toBe(true);
}
