/**
 * The publications The Stacks' visual regression suite renders. See
 * shots/visual-fixtures-accounts.setup.ts and shots/visual-fixtures.setup.ts,
 * which seed them.
 *
 * The content comes from the Google Docs, so editing a doc changes what the
 * next seed imports. Everything else is defined here.
 */

import type { Credentials } from "./env";

export interface FixtureUser {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** Every fixture user signs in with this password. */
export const FIXTURE_USER_PASSWORD = "visual_fixtures_password";

export function fixtureCredentials(user: FixtureUser): Credentials {
  return { username: user.username, password: FIXTURE_USER_PASSWORD };
}

export const ALEX: FixtureUser = {
  username: "alex-example",
  firstName: "Alex",
  lastName: "Example",
  email: "alex@example.com",
};
export const SAM: FixtureUser = {
  username: "sam-sample",
  firstName: "Sam",
  lastName: "Sample",
  email: "sam@example.com",
};
export const JORDAN: FixtureUser = {
  username: "jordan-fixture",
  firstName: "Jordan",
  lastName: "Fixture",
  email: "jordan@example.com",
};
export const CASEY: FixtureUser = {
  username: "casey-commenter",
  firstName: "Casey",
  lastName: "Commenter",
  email: "casey@example.com",
};
export const RILEY: FixtureUser = {
  username: "riley-reader",
  firstName: "Riley",
  lastName: "Reader",
  email: "riley@example.com",
};
export const MORGAN: FixtureUser = {
  username: "morgan-mock",
  firstName: "Morgan",
  lastName: "Mock",
  email: "morgan@example.com",
};
export const TAYLOR: FixtureUser = {
  username: "taylor-tester",
  firstName: "Taylor",
  lastName: "Tester",
  email: "taylor@example.com",
};

export const FIXTURE_USERS = [ALEX, SAM, JORDAN, CASEY, RILEY, MORGAN, TAYLOR];

/** Owns both publications, so it imports and releases them. */
export const OWNER = SAM;

/**
 * Recording an external DOI requires the owner to belong to this org, and it
 * is also one of the backend's PUBLICATION_CREATOR_ORGS.
 */
export const SELF_MINTING_ORG = {
  name: "Arcadia Science",
  slug: "arcadia-science",
};

/** Hosts visual-test-2, and is Alex's affiliation there. */
export const FIXTURE_ORG = {
  name: "Example Institute",
  slug: "example-institute",
};

export interface FixtureContributor {
  user: FixtureUser;
  roles: string[];
  inByline: boolean;
  affiliatedWithOrg?: boolean;
}

export interface FixtureComment {
  author: FixtureUser;
  body: string;
  replies?: FixtureComment[];
  /** Saved again after posting, so it shows as edited. */
  edited?: boolean;
  withdrawn?: boolean;
}

export interface FixturePublication {
  slug: string;
  googleDocUrl: string;
  contributors: FixtureContributor[];
  hostedByOrg: boolean;
  tags: string[];
  /** Recorded as an external DOI: the screenshot backend mints none. */
  doi?: string;
  comments: FixtureComment[];
}

export const FIXTURE_PUBLICATIONS: FixturePublication[] = [
  {
    slug: "visual-test-1",
    googleDocUrl:
      "https://docs.google.com/document/d/1MBuh9fDbragIcZdCnMNy2f8RJWN788fPpY3ShaITBAU/edit",
    contributors: [
      { user: ALEX, roles: ["Conceptualization"], inByline: true },
      { user: SAM, roles: ["Methodology"], inByline: false },
      { user: JORDAN, roles: ["Formal analysis"], inByline: false },
    ],
    hostedByOrg: false,
    tags: [],
    comments: [
      {
        author: MORGAN,
        body: "How long did the tardigrades stay in the tun state before rehydration?",
        replies: [
          {
            author: TAYLOR,
            body: "The supplementary video covers it, about halfway through.",
            edited: true,
          },
          {
            author: ALEX,
            body: "Agreed. The tun-state figure makes that clear.",
          },
        ],
      },
      {
        author: MORGAN,
        body: "Is the raw tun-state data available anywhere?",
        withdrawn: true,
      },
    ],
  },
  {
    slug: "visual-test-2",
    googleDocUrl:
      "https://docs.google.com/document/d/1bDPN6td2dCdQDvUgQ-_42WKCj15nBRgl5U9GY5lp_p0/edit",
    contributors: [
      {
        user: ALEX,
        roles: ["Conceptualization", "Critical feedback"],
        inByline: true,
        affiliatedWithOrg: true,
      },
      {
        user: SAM,
        roles: ["Conceptualization", "Formal analysis"],
        inByline: true,
      },
      { user: JORDAN, roles: ["Methodology"], inByline: false },
    ],
    hostedByOrg: true,
    tags: ["Informative failure"],
    doi: "10.83972/visual-test-2",
    comments: [
      {
        author: SAM,
        body: "Testing comments for visual tests",
        replies: [{ author: CASEY, body: "test replies" }],
      },
      { author: CASEY, body: "test 2" },
      {
        author: RILEY,
        body: "Should the second table repeat its header row after the group break?",
        replies: [
          {
            author: CASEY,
            body: "Yes, it should. The group break starts a new header row.",
          },
          { author: ALEX, body: "Agreed, I'll update the table." },
        ],
      },
    ],
  },
];
