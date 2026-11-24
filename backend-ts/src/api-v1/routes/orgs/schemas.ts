import {
  isUtcDateAfter,
  isValidDbDateTime,
  iso8601ToDbDate,
} from "#src/lib/dates.js";
import {
  extendedPaginatedResponse,
  paginatedResponse,
} from "#v1/lib/route-responses/pagination.js";
import { ulidSchema } from "#v1/lib/schemas/ulid-schema.js";
import { PublicationListOrgResponseSchema } from "#v1/routes/publications/route-responses/publication-list-item.js";
import { ContributorResponseSchema } from "#v1/routes/publications/route-responses/publication.js";
import { z } from "@hono/zod-openapi";

export const OrgIdOrSlugParamSchema = z.object({
  idOrSlug: z.string().openapi({
    param: { name: "idOrSlug", in: "path" },
    description: "The organization's id, or its slug.",
    example: "arcadia-science",
  }),
});

export const OrgIdOrSlugAndMemberParamsSchema = OrgIdOrSlugParamSchema.extend({
  memberId: ulidSchema(),
});

const UtcDateTimeSchema = z.iso.datetime({ precision: 3 });

export const OrgResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    avatar: z.string().nullable(),
    profile: z.string().nullable(),
    rorId: z.string().nullable(),
    unlisted: z.boolean().nullable(),
    createdAt: UtcDateTimeSchema.nullable(),
    updatedAt: UtcDateTimeSchema.nullable(),
    canEdit: z.boolean().optional(),
  })
  .openapi("Organization");

export const OrgListItemResponseSchema = OrgResponseSchema.omit({
  canEdit: true,
}).openapi("OrganizationListItem");
export type OrgListItemResponse = z.infer<typeof OrgListItemResponseSchema>;

export const OrgListResponseSchema = extendedPaginatedResponse(
  OrgListItemResponseSchema,
  // @todo move totalUnlisted to `stats` (see "List envelope" in the
  // api-versioning skill).
  { totalUnlisted: z.int() }
);

const OrgNameSchema = z
  .string()
  .trim()
  .min(1, "name is required")
  .max(255, "name must be 255 characters or fewer");

const databaseDateTimePattern =
  /^[1-9]\d{3}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]) (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d*)?$/;
const isoDateTimeSchema = z.iso.datetime({
  offset: true,
  local: true,
});

export const MembershipDateTimeSchema = z
  .string()
  .refine(
    (value) =>
      databaseDateTimePattern.test(value)
        ? isValidDbDateTime(value)
        : isoDateTimeSchema.safeParse(value).success,
    "Must be a valid datetime with seconds"
  )
  .transform((value) =>
    databaseDateTimePattern.test(value) ? value : iso8601ToDbDate(value)
  )
  .openapi({
    description:
      "A datetime with seconds. Values without a timezone are interpreted as UTC; values with a timezone are converted to UTC.",
    example: "2024-02-29T13:34:56+01:00",
  });

export const MEMBERSHIP_DATES_MESSAGE =
  "End date must not be before start date";

/** Compares parsed `MembershipDateTimeSchema` values, so equal dates pass. */
export function isMembershipStartAfterEnd(
  startAt: string | null | undefined,
  endAt: string | null | undefined
): boolean {
  if (!startAt || !endAt) return false;
  return isUtcDateAfter(startAt, endAt);
}

export const CreateOrgBodySchema = z
  .object({
    name: OrgNameSchema,
    avatar: z.string().nullable().optional(),
    profile: z.string().nullable().optional(),
  })
  .openapi("CreateOrgBody");

// True partial update, matching the PATCH publications convention: a field
// omitted from the body is left untouched; `name` may not be cleared (an
// organization always has a name), `avatar`/`profile` may be set to `null`.
export const UpdateOrgBodySchema = z
  .object({
    name: OrgNameSchema.max(255).optional(),
    avatar: z.string().nullable().optional(),
    profile: z.string().nullable().optional(),
  })
  .openapi("UpdateOrgBody");

export const OrgMemberResponseSchema = z
  .object({
    userId: z.string(),
    username: z.string().nullable(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    avatar: z.string().nullable(),
    orcid: z.string().nullable(),
    isAdmin: z.boolean(),
    startAt: UtcDateTimeSchema.nullable(),
    endAt: UtcDateTimeSchema.nullable(),
  })
  .openapi("OrgMember");

export const PublicOrgMemberResponseSchema = OrgMemberResponseSchema.pick({
  userId: true,
  username: true,
  firstName: true,
  lastName: true,
  avatar: true,
  orcid: true,
}).openapi("PublicOrgMember");

export const OrgMembersListResponseSchema = paginatedResponse(
  z.union([OrgMemberResponseSchema, PublicOrgMemberResponseSchema])
);

export const OrgPublicationListItemSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    doi: z.string().nullable(),
    title: z.string().nullable(),
    abstract: z.string().nullable(),
    createdAt: UtcDateTimeSchema,
    numComments: z.number(),
    contributors: z.array(ContributorResponseSchema),
    orgs: z.array(PublicationListOrgResponseSchema),
    tags: z.array(z.string()),
  })
  .openapi("OrgPublicationListItem");

export const AvatarResponseSchema = z
  .object({ avatarUrl: z.string() })
  .openapi("AvatarResponse");

export const OrgPublicationsListResponseSchema = paginatedResponse(
  OrgPublicationListItemSchema
);

export const PutAvatarBodySchema = z.object({
  // Optional so a request that omits the file reaches the handler's own
  // check and gets the documented 400 "No avatar file provided" response,
  // instead of a generic 422 from schema validation.
  avatar: z.custom<File>().optional().openapi({
    type: "string",
    format: "binary",
    description: "png/jpg/jpeg/gif image file.",
  }),
});
