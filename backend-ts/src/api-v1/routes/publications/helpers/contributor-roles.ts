/** The roles the web editor offers; keep in sync with thestacks.org's `CONTRIBUTOR_ROLES`. */
export const CONTRIBUTOR_ROLES = [
  "Conceptualization",
  "Critical feedback",
  "Data curation",
  "Editing",
  "Experimental design",
  "Formal analysis",
  "Investigation",
  "Methodology",
  "Project administration",
  "Resources",
  "Software",
  "Supervision",
  "Validation",
  "Visualization",
  "Writing",
] as const;

/** The role a contributor gets when none of theirs is one of the editor's. */
export const DEFAULT_ROLE = "Writing";

/** CRediT roles whose names differ from the editor's. */
const CREDIT_ROLES: Record<string, (typeof CONTRIBUTOR_ROLES)[number]> = {
  "writing - original draft": "Writing",
  "writing - review & editing": "Editing",
};

const ROLES_BY_KEY = new Map<string, (typeof CONTRIBUTOR_ROLES)[number]>([
  ...CONTRIBUTOR_ROLES.map((role) => [roleKey(role), role] as const),
  ...Object.entries(CREDIT_ROLES),
]);

/**
 * The editor's role for a CRediT role or one of the editor's own, matched
 * regardless of case and dash style, or undefined when there's none (such as
 * CRediT's `Funding acquisition`).
 */
export function toContributorRole(
  role: string
): (typeof CONTRIBUTOR_ROLES)[number] | undefined {
  return ROLES_BY_KEY.get(roleKey(role));
}

function roleKey(role: string): string {
  return role
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ");
}
