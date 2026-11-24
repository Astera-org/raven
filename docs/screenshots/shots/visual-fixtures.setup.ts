import {
  expect,
  test as setup,
  type APIRequestContext,
  type PlaywrightWorkerArgs,
} from "@playwright/test";

import { newApiContext, signIn } from "#src/auth";
import { findOwnPublication } from "#src/publications";
import {
  FIXTURE_ORG,
  FIXTURE_PUBLICATIONS,
  fixtureCredentials,
  OWNER,
  type FixtureComment,
  type FixturePublication,
  type FixtureUser,
} from "#src/visual-fixtures";

// Releases the visual regression fixtures through the API, the way an author
// and readers would make them. The users and orgs come first, from
// visual-fixtures-accounts.setup.ts. Every step checks first and skips if it
// is already done, so a rerun against the same deployment changes nothing.

type Playwright = PlaywrightWorkerArgs["playwright"];

const IMPORT_TIMEOUT = 120_000;
const MEDIA_COPY_TIMEOUT = 180_000;
const PUBLISH_TIMEOUT = 120_000;

interface ValidationIssue {
  path: (string | number | null)[];
  message: string;
}

/** One signed-in request context per fixture user, disposed together. */
class Sessions {
  private readonly contexts = new Map<string, APIRequestContext>();

  constructor(private readonly playwright: Playwright) {}

  async as(user: FixtureUser): Promise<APIRequestContext> {
    const existing = this.contexts.get(user.username);
    if (existing) return existing;

    const request = await newApiContext(this.playwright);
    await signIn(request, fixtureCredentials(user));
    this.contexts.set(user.username, request);
    return request;
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.contexts.values()].map((c) => c.dispose()));
  }
}

/** The backend ids the fixture publications refer to. */
interface FixtureIds {
  userIds: Map<string, string>;
  fixtureOrgId: string;
}

async function findUserId(
  request: APIRequestContext,
  user: FixtureUser
): Promise<string> {
  const response = await request.get(
    `/api/v1/users?q=${encodeURIComponent(user.username)}&perPage=100`
  );
  expect(response.ok(), await response.text()).toBe(true);
  const { items } = (await response.json()) as {
    items: { id: string; username: string }[];
  };
  const found = items.find((item) => item.username === user.username);
  if (!found) throw new Error(`No user "${user.username}".`);
  return found.id;
}

async function findOrgId(
  request: APIRequestContext,
  slug: string
): Promise<string> {
  const response = await request.get(`/api/v1/orgs/${slug}`);
  expect(response.ok(), await response.text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return id;
}

async function resolveFixtureIds(
  owner: APIRequestContext
): Promise<FixtureIds> {
  const contributors = new Map(
    FIXTURE_PUBLICATIONS.flatMap((publication) =>
      publication.contributors.map(({ user }) => [user.username, user])
    )
  );
  const [userIds, fixtureOrgId] = await Promise.all([
    Promise.all(
      [...contributors.values()].map(
        async (user) => [user.username, await findUserId(owner, user)] as const
      )
    ),
    findOrgId(owner, FIXTURE_ORG.slug),
  ]);
  return { userIds: new Map(userIds), fixtureOrgId };
}

/** Imports the Google Doc as a new draft and gives it the fixture's slug. */
async function importDraft(
  owner: APIRequestContext,
  publication: FixturePublication
): Promise<string> {
  const imported = await owner.post("/api/v1/imports", {
    data: { source: { type: "url", url: publication.googleDocUrl } },
    timeout: IMPORT_TIMEOUT,
  });
  expect(imported.ok(), await imported.text()).toBe(true);
  const { publicationId } = (await imported.json()) as {
    publicationId: string;
  };

  // Set straight away, so a rerun after a later step fails finds the draft.
  await patchDraft(owner, publicationId, { slug: publication.slug });
  return publicationId;
}

/**
 * PATCH /draft answers 200 even when it drops a field or a contributor or
 * org update fails, so check its issues too. Only issues about the fields
 * sent count: the rest are publish-readiness issues a later step resolves.
 */
async function patchDraft(
  owner: APIRequestContext,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  const response = await owner.patch(`/api/v1/publications/id/${id}/draft`, {
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { validationErrors } = (await response.json()) as {
    validationErrors: ValidationIssue[];
  };
  const sent = Object.keys(data);
  expect(
    validationErrors.filter((issue) => sent.includes(String(issue.path[0])))
  ).toEqual([]);
}

/** Waits until the draft's import has copied every media item. */
async function expectMediaCopied(
  owner: APIRequestContext,
  id: string
): Promise<void> {
  const draft = await owner.get(`/api/v1/publications/id/${id}/draft`);
  expect(draft.ok(), await draft.text()).toBe(true);
  const { publication } = (await draft.json()) as {
    publication: { importDocument?: { id: string | null } };
  };
  const importId = publication.importDocument?.id;
  if (!importId) throw new Error(`Draft ${id} was not imported.`);

  let uploads: { ref: string; status: string }[] = [];
  await expect
    .poll(
      async () => {
        const response = await owner.get(`/api/v1/imports/${importId}`);
        expect(response.ok(), await response.text()).toBe(true);
        const status = (await response.json()) as {
          settled: boolean;
          uploads: { ref: string; status: string }[];
        };
        uploads = status.uploads;
        return status.settled;
      },
      { timeout: MEDIA_COPY_TIMEOUT, intervals: [1_000, 2_000, 5_000] }
    )
    .toBe(true);
  expect(uploads.filter((upload) => upload.status !== "completed")).toEqual([]);
}

async function ensureReleased(
  owner: APIRequestContext,
  publication: FixturePublication,
  { userIds, fixtureOrgId }: FixtureIds
): Promise<void> {
  const existing = await findOwnPublication(owner, publication.slug);
  if (existing?.state === "PUBLISHED") return;

  const id = existing?.id ?? (await importDraft(owner, publication));
  await expectMediaCopied(owner, id);

  await patchDraft(owner, id, {
    license: "CC BY",
    contributors: publication.contributors.map((contributor) => ({
      userId: userIds.get(contributor.user.username),
      roles: contributor.roles,
      inByline: contributor.inByline,
      affiliations: contributor.affiliatedWithOrg ? [fixtureOrgId] : [],
    })),
    orgs: publication.hostedByOrg ? [{ orgId: fixtureOrgId }] : [],
    tags: publication.tags,
  });

  if (publication.doi) {
    const doi = await owner.put(`/api/v1/publications/id/${id}/doi`, {
      data: { doi: publication.doi },
    });
    expect(doi.ok(), await doi.text()).toBe(true);
  }

  const published = await owner.post(`/api/v1/publications/id/${id}/publish`, {
    timeout: PUBLISH_TIMEOUT,
  });
  expect(published.ok(), await published.text()).toBe(true);
}

/** The integer id the v0 comments API takes. */
async function findPublicationIntId(
  request: APIRequestContext,
  slug: string
): Promise<number> {
  const response = await request.get(`/api/publications/${slug}`);
  expect(response.ok(), await response.text()).toBe(true);
  const { publication } = (await response.json()) as {
    publication: { id: number };
  };
  return publication.id;
}

async function postComment(
  sessions: Sessions,
  publicationIntId: number,
  comment: FixtureComment,
  parentId: number | null
): Promise<void> {
  const author = await sessions.as(comment.author);
  const posted = await author.post(
    `/api/comments/publication/${publicationIntId}`,
    { data: { body: comment.body, parent_id: parentId } }
  );
  expect(posted.ok(), await posted.text()).toBe(true);
  const { comment_id: commentId } = (await posted.json()) as {
    comment_id: number;
  };

  if (comment.edited) {
    const edited = await author.patch(`/api/comments/${commentId}`, {
      data: { body: comment.body },
    });
    expect(edited.ok(), await edited.text()).toBe(true);
  }
  if (comment.withdrawn) {
    const withdrawn = await author.patch(`/api/comments/${commentId}`, {
      data: { state: "WITHDRAWN" },
    });
    expect(withdrawn.ok(), await withdrawn.text()).toBe(true);
  }

  for (const reply of comment.replies ?? []) {
    await postComment(sessions, publicationIntId, reply, commentId);
  }
}

/** Posts the fixture's comment threads, unless it has comments already. */
async function ensureComments(
  sessions: Sessions,
  publication: FixturePublication
): Promise<void> {
  const owner = await sessions.as(OWNER);
  const publicationIntId = await findPublicationIntId(owner, publication.slug);
  const existing = await owner.get(
    `/api/comments/publication/${publicationIntId}`
  );
  expect(existing.ok(), await existing.text()).toBe(true);
  const { pagination } = (await existing.json()) as {
    pagination: { total: number };
  };
  if (pagination.total > 0) return;

  for (const comment of publication.comments) {
    await postComment(sessions, publicationIntId, comment, null);
  }
}

let sessions: Sessions;
let fixtureIds: FixtureIds;

setup.beforeAll(async ({ playwright }) => {
  sessions = new Sessions(playwright);
  fixtureIds = await resolveFixtureIds(await sessions.as(OWNER));
});

setup.afterAll(async () => {
  await sessions.dispose();
});

for (const publication of FIXTURE_PUBLICATIONS) {
  setup(`release ${publication.slug}`, async () => {
    // Each step's own timeout, plus a minute for the smaller requests.
    setup.setTimeout(
      IMPORT_TIMEOUT + MEDIA_COPY_TIMEOUT + PUBLISH_TIMEOUT + 60_000
    );
    const owner = await sessions.as(OWNER);
    await ensureReleased(owner, publication, fixtureIds);
    await ensureComments(sessions, publication);
  });
}
