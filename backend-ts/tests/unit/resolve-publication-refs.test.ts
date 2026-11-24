import { resolveContributors } from "#src/lib/publications/resolve-contributors.js";
import { resolveOrgs } from "#src/lib/publications/resolve-orgs.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { describe, expect, it } from "vitest";

const ORGS = [
  { id: "org-a", slug: "a", rorId: "ror-a" },
  { id: "org-b", slug: "b", rorId: "ror-b" },
];
const USERS = [
  { id: "user-ada", orcid: "0000-0001", email: "ada@example.com" },
  { id: "user-bo", orcid: null, email: "bo@example.com" },
];

const repos = {
  orgs: {
    listById: async (ids: string[]) => ORGS.filter((o) => ids.includes(o.id)),
    listBySlug: async (slugs: string[]) =>
      ORGS.filter((o) => slugs.includes(o.slug)),
    findOrgByRorId: async (rorId: string) =>
      ORGS.find((o) => o.rorId === rorId),
  },
  users: {
    findByOrcid: async (orcid: string) => USERS.find((u) => u.orcid === orcid),
    findByEmail: async (email: string) => USERS.find((u) => u.email === email),
  },
} as unknown as Repositories;

describe("resolveOrgs", () => {
  it("finds orgs by id, slug and ROR ID in order, once each", async () => {
    const result = await resolveOrgs(
      repos,
      [
        { by: "slug", value: "b" },
        { by: "rorId", value: "ror-a" },
        { by: "id", value: "org-b" },
      ],
      { path: ["orgs"] }
    );

    expect(result).toEqual({ orgIds: ["org-b", "org-a"], issues: [] });
  });

  it("reports unknown orgs as not found, or as skipped", async () => {
    const lookups = [
      { by: "slug", value: "nope" },
      { by: "name", value: "Org A" },
    ] as const;

    const strict = await resolveOrgs(repos, [...lookups], { path: ["orgs"] });
    const lenient = await resolveOrgs(repos, [...lookups], {
      path: ["orgs"],
      skip: true,
    });

    expect(strict.issues).toEqual([
      expect.objectContaining({ path: ["orgs", 0], message: "Org not found" }),
      expect.objectContaining({ path: ["orgs", 1], message: "Org not found" }),
    ]);
    expect(lenient.issues.map((issue) => issue.message)).toEqual([
      'Org with slug "nope" not found; skipped',
      'Org with name "Org A" not found; skipped',
    ]);
  });
});

describe("resolveContributors", () => {
  it("tries refs in order and merges entries for the same user", async () => {
    const result = await resolveContributors(
      repos,
      [
        {
          user: [
            { by: "orcid", value: "0000-9999" },
            { by: "email", value: "ada@example.com" },
          ],
          roles: ["Software"],
          inByline: false,
          affiliations: [{ by: "rorId", value: "ror-a" }],
        },
        {
          user: [{ by: "orcid", value: "0000-0001" }],
          roles: ["Writing – original draft"],
          inByline: true,
          affiliations: [],
        },
      ],
      ["authors"]
    );

    expect(result).toEqual({
      contributors: [
        {
          userId: "user-ada",
          roles: ["Software", "Writing"],
          inByline: true,
          affiliations: ["org-a"],
        },
      ],
      issues: [],
    });
  });

  it("defaults the role and reports what it leaves out at the document's path", async () => {
    const result = await resolveContributors(
      repos,
      [
        {
          user: [{ by: "email", value: "bo@example.com" }],
          roles: ["Funding acquisition"],
          inByline: true,
          affiliations: [{ by: "rorId", value: "ror-unknown" }],
        },
        {
          user: [{ by: "fullname", value: "Cy" }],
          displayName: "Cy",
          roles: [],
          inByline: true,
          affiliations: [],
        },
      ],
      ["authors"]
    );

    expect(result.contributors).toEqual([
      {
        userId: "user-bo",
        roles: ["Writing"],
        inByline: true,
        affiliations: [],
      },
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        path: ["authors", 0, "roles", 0],
        message: `"Funding acquisition" isn't a contributor role on The Stacks; left out`,
      }),
      expect.objectContaining({
        path: ["authors", 0, "affiliations", 0],
        message: 'Org with rorId "ror-unknown" not found; skipped',
      }),
      expect.objectContaining({
        path: ["authors", 1],
        message:
          'Author "Cy" has no ORCID iD or email to find them by; skipped',
      }),
    ]);
  });
});
