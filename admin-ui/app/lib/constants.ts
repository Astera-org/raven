export const ORG_ROLES = [
  { label: "Org Admin", value: "ADMIN" },
  { label: "Member", value: "MEMBER" },
] as const;

export type OrgRoleValue = (typeof ORG_ROLES)[number]["value"];

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ORG_ROLES.map((r) => [r.value, r.label])
);

export const INPUT_FIELD_CLASSES =
  "text-body-20 w-full rounded-lg border border-carbon-100 bg-white px-3 py-2 text-foreground outline-none transition-colors focus:border-carbon-300";

export const FORM_LABEL_CLASSES =
  "text-caption-20 font-medium uppercase tracking-widest text-carbon-400";
