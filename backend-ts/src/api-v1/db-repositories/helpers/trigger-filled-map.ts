import {
  type comments,
  type contributorAffiliations,
  type contributors,
  type contributorsLegacy,
  type followers,
  type linkedAssets,
  type notifications,
  type notificationTypes,
  type organizations,
  type orgFollowers,
  type orgPublicationMap,
  type orgUserMap,
  type publications,
  type publicationTags,
  type references,
  type tempLinks,
  type userNotificationSettings,
  type users,
  type versionReferences,
  type versions,
} from "#src/db/schema.js";
import { type Nullable } from "#src/types/generics.js";
import { type Table } from "drizzle-orm";

type TriggerColumns<
  T extends Table,
  TNullable extends keyof T["$inferInsert"] = never,
  TOptional extends keyof T["$inferInsert"] = never,
> = {
  nullable: TNullable;
  optional: TOptional;
};

// Mirrors the `<table>_bi` BEFORE INSERT triggers: `nullable` columns are
// `*_int` ids the trigger resolves from their ULID counterpart, and `optional`
// columns are filled with `ULID()` by the trigger when omitted.
type TriggerFilledColumns = {
  comments: TriggerColumns<
    typeof comments,
    "publicationIdInt" | "versionIdInt" | "userIdInt" | "parentIdInt" | "id"
  >;
  contributor_affiliations: TriggerColumns<
    typeof contributorAffiliations,
    "versionIdInt" | "userIdInt" | "affiliatedOrgIdInt" | "id"
  >;
  contributors: TriggerColumns<
    typeof contributors,
    "versionIdInt" | "userIdInt"
  >;
  contributors_legacy: TriggerColumns<
    typeof contributorsLegacy,
    "publicationIdInt" | "userIdInt"
  >;
  followers: TriggerColumns<
    typeof followers,
    "leaderIdInt" | "followerIdInt" | "id"
  >;
  linked_assets: TriggerColumns<typeof linkedAssets, "versionIdInt">;
  notification_types: TriggerColumns<typeof notificationTypes, never, "id">;
  notifications: TriggerColumns<
    typeof notifications,
    "userIdInt" | "publicationIdInt" | "commentIdInt" | "id"
  >;
  org_followers: TriggerColumns<
    typeof orgFollowers,
    "orgIdInt" | "followerIdInt" | "id"
  >;
  org_publication_map: TriggerColumns<
    typeof orgPublicationMap,
    "orgIdInt" | "publicationIdInt"
  >;
  org_user_map: TriggerColumns<typeof orgUserMap, "orgIdInt" | "userIdInt">;
  organizations: TriggerColumns<typeof organizations, never, "id">;
  publication_tags: TriggerColumns<typeof publicationTags, "publicationIdInt">;
  publications: TriggerColumns<typeof publications, "ownerIdInt", "id">;
  references: TriggerColumns<typeof references, never, "id">;
  temp_links: TriggerColumns<typeof tempLinks, "userIdInt", "id">;
  user_notification_settings: TriggerColumns<
    typeof userNotificationSettings,
    "userIdInt" | "notificationTypeIdInt" | "id"
  >;
  users: TriggerColumns<typeof users, never, "id">;
  version_references: TriggerColumns<
    typeof versionReferences,
    "versionIdInt" | "referenceIdInt" | "id"
  >;
  versions: TriggerColumns<typeof versions, "publicationIdInt" | "id">;
};

type TriggerFilledTable = Table & {
  _: { name: keyof TriggerFilledColumns };
};

type ApplyTriggerFilled<
  TInsert,
  TNullable extends keyof TInsert,
  TOptional extends keyof TInsert,
> = Omit<TInsert, TNullable | TOptional> &
  Partial<Pick<TInsert, TOptional>> &
  Nullable<Pick<TInsert, TNullable>>;

export type TriggerFilled<T extends TriggerFilledTable> = ApplyTriggerFilled<
  T["$inferInsert"],
  TriggerFilledColumns[T["_"]["name"]]["nullable"] & keyof T["$inferInsert"],
  TriggerFilledColumns[T["_"]["name"]]["optional"] & keyof T["$inferInsert"]
>;

/**
 * Casts an array of trigger-filled values for a drizzle insert query for a specific
 * table. This allows for type-safe insertion of trigger-filled deprecated integer
 * IDs for drizzle insert queries.
 *
 * @param values The array of trigger-filled values to be inserted.
 * @returns The array of values cast to the table's insert type.
 */
export function triggerFilled<T extends TriggerFilledTable>(
  values: TriggerFilled<T>
): T["$inferInsert"];
export function triggerFilled<T extends TriggerFilledTable>(
  values: TriggerFilled<T>[]
): T["$inferInsert"][];
export function triggerFilled<T extends TriggerFilledTable>(
  values: TriggerFilled<T> | TriggerFilled<T>[]
) {
  return values as T["$inferInsert"] | T["$inferInsert"][];
}

/**
 * Shorthand function for `triggerFilled`.
 *
 * Casts an array of trigger-filled values for a drizzle insert query for a specific
 * table. This allows for type-safe insertion of trigger-filled deprecated integer
 * IDs for drizzle insert queries.
 *
 * @param values The array of trigger-filled values to be inserted.
 * @returns The array of values cast to the table's insert type.
 */
export const tf = triggerFilled;
