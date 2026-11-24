/**
 * The Response types for hono can be inferred, but they need to either be
 * precompiled with `pnpm build` or `tsc --emitDeclarationOnly` _every time_
 * a change happens.
 *
 * The alternative is to infer live from the package, but that means for each
 * access, the VSCode typescript server does a recompile of the whole app,
 * which is very slow. (How it's currently set up.)
 *
 * So to bypass both of those and achieve fast and always up-to-date types,
 * the zod schemas and types are exported here to be used as the import
 * `@raven/backend-ts/types`.
 */
import type { z } from "@hono/zod-openapi";

import type { PaginationQueryRequestSchema } from "#v1/lib/route-requests/pagination.js";
import type { NonOwnerUserResponseSchema } from "#v1/lib/route-responses/user.js";
import type { GetDoiComparisonQuerySchema } from "#v1/routes/admin/doi-audits/route-requests/get-doi-comparison.js";
import type { PostDoiPushBodySchema } from "#v1/routes/admin/doi-audits/route-requests/post-doi-push.js";
import type { GetAdminPublicationListQuerySchema } from "#v1/routes/admin/publications/route-requests/get-admin-publication-list.js";
import type { AdminUpdatePublicationBodySchema } from "#v1/routes/admin/publications/route-requests/patch-admin-publication.js";
import type { AdminPublicationListResponseSchema } from "#v1/routes/admin/publications/route-responses/admin-publication-list.js";
import type { AdminPublicationResponseSchema } from "#v1/routes/admin/publications/route-responses/admin-publication.js";
import type { GetAdminUserListQuerySchema } from "#v1/routes/admin/users/route-requests/get-admin-user-list.js";
import type { AdminUpdateUserBodySchema } from "#v1/routes/admin/users/route-requests/patch-admin-user.js";
import type {
  AvatarResponseSchema,
  CreateOrgBodySchema,
  OrgListResponseSchema,
  OrgMemberResponseSchema,
  OrgMembersListResponseSchema,
  OrgPublicationListItemSchema,
  OrgPublicationsListResponseSchema,
  OrgResponseSchema,
  PublicOrgMemberResponseSchema,
  PutAvatarBodySchema,
  UpdateOrgBodySchema,
} from "#v1/routes/orgs/schemas.js";
import type { GetPublicationsQuerySchema } from "#v1/routes/publications/route-requests/get-publications.js";
import type { PatchPublicationPermissiveSchema } from "#v1/routes/publications/route-requests/patch-publication.js";
import type { CreatePublicationBodySchema } from "#v1/routes/publications/route-requests/post-publications.js";
import type { PostVersionBodySchema } from "#v1/routes/publications/route-requests/post-version.js";
import type { PutDoiBodySchema } from "#v1/routes/publications/route-requests/put-doi.js";
import type {
  CandidateOrgListResponseSchema,
  CandidateOrgResponseSchema,
} from "#v1/routes/publications/route-responses/candidate-orgs.js";
import type {
  CreateDraftResponseSchema,
  CreatePublicationResponseSchema,
} from "#v1/routes/publications/route-responses/create-draft.js";
import type {
  DoiEligibilityResponseSchema,
  GetDoiResponseSchema,
  PostDoiResponseSchema,
  PutDoiResponseSchema,
} from "#v1/routes/publications/route-responses/doi.js";
import type {
  GetDraftResponseSchema,
  PatchDraftResponseSchema,
} from "#v1/routes/publications/route-responses/draft.js";
import type { PublicationListResponseSchema } from "#v1/routes/publications/route-responses/publication-list-item.js";
import type { GetPublicationResponseSchema } from "#v1/routes/publications/route-responses/publication.js";
import type { HealthResponseSchema } from "#v1/routes/system/route-responses/health.js";
import type { GetMyPublicationListQuerySchema } from "#v1/routes/users/route-requests/get-my-publication-list.js";
import type { GetUsersQuerySchema } from "#v1/routes/users/route-requests/get-users.js";
import type { CurrentUserResponseSchema } from "#v1/routes/users/route-responses/current-user.js";
import type {
  MyPublicationListItemResponseSchema,
  MyPublicationListResponseSchema,
} from "#v1/routes/users/route-responses/my-publication-list.js";
import type { UserListResponseSchema } from "#v1/routes/users/route-responses/user-list.js";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type {
  PaginatedResponseV1 as Paginated,
  PaginationResponseV1 as Pagination,
} from "#v1/lib/route-responses/pagination.js";
export type PaginationQuery = z.input<typeof PaginationQueryRequestSchema>;
export type HealthResponse = z.output<typeof HealthResponseSchema>;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export {
  DOI_COMPARISON_TYPES,
  type DoiComparisonType,
} from "#v1/routes/admin/doi-audits/route-requests/get-doi-comparison.js";
export * from "#v1/routes/admin/doi-audits/route-responses/doi-audit.js";
export * from "#v1/routes/admin/doi-audits/route-responses/doi-comparison.js";
export * from "#v1/routes/admin/doi-audits/route-responses/doi-push.js";
export * from "#v1/routes/admin/orgs/route-responses/orgs.js";
export type { AdminPublicationStateFilter } from "#v1/routes/admin/publications/route-requests/get-admin-publication-list.js";
export type {
  AdminUserCommentListResponse,
  AdminUserCommentResponse,
} from "#v1/routes/admin/users/route-responses/admin-user-comment-list.js";
export type {
  AdminUserListItemResponse,
  AdminUserListResponse,
  AdminUserOrganizationResponse,
  AdminUserStatsResponse,
} from "#v1/routes/admin/users/route-responses/admin-user-list.js";
export type {
  AdminUserOrgListResponse,
  AdminUserOrgResponse,
} from "#v1/routes/admin/users/route-responses/admin-user-org-list.js";
export type { AdminUserResponse } from "#v1/routes/admin/users/route-responses/admin-user.js";
export type GetDoiComparisonQuery = z.input<typeof GetDoiComparisonQuerySchema>;
export type PostDoiPushBody = z.input<typeof PostDoiPushBodySchema>;
export type GetAdminPublicationListQuery = z.input<
  typeof GetAdminPublicationListQuerySchema
>;
export type AdminPublicationListResponse = z.output<
  typeof AdminPublicationListResponseSchema
>;
export type AdminPublicationResponse = z.output<
  typeof AdminPublicationResponseSchema
>;
export type AdminUpdatePublicationBody = z.input<
  typeof AdminUpdatePublicationBodySchema
>;
export type GetAdminUserListQuery = z.input<typeof GetAdminUserListQuerySchema>;
export type AdminUpdateUserBody = z.input<typeof AdminUpdateUserBodySchema>;

// ---------------------------------------------------------------------------
// Orgs
// ---------------------------------------------------------------------------

export type { OrgListItemResponse } from "#v1/routes/orgs/schemas.js";
export type OrgResponse = z.output<typeof OrgResponseSchema>;
export type OrgListResponse = z.output<typeof OrgListResponseSchema>;
export type CreateOrgBody = z.input<typeof CreateOrgBodySchema>;
export type UpdateOrgBody = z.input<typeof UpdateOrgBodySchema>;
export type PutAvatarBody = z.input<typeof PutAvatarBodySchema>;
export type AvatarResponse = z.output<typeof AvatarResponseSchema>;
export type OrgMemberResponse = z.output<typeof OrgMemberResponseSchema>;
export type PublicOrgMemberResponse = z.output<
  typeof PublicOrgMemberResponseSchema
>;
export type OrgMembersListResponse = z.output<
  typeof OrgMembersListResponseSchema
>;
export type OrgPublicationListItem = z.output<
  typeof OrgPublicationListItemSchema
>;
export type OrgPublicationsListResponse = z.output<
  typeof OrgPublicationsListResponseSchema
>;

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

export type {
  ContributorsUpdate,
  DoiUpdate,
  ImportDocumentUpdate,
  LinkedUpdateAsset,
  OrgsUpdate,
  PatchPublicationStrict,
  TagUpdate,
} from "#v1/routes/publications/route-requests/patch-publication.js";
export type {
  PublicationListContributorResponse,
  PublicationListItemResponse,
  PublicationListOrgResponse,
} from "#v1/routes/publications/route-responses/publication-list-item.js";
export type {
  ContributorAffiliationResponse,
  ContributorResponse,
  ImportDocumentResponse,
  LinkedAssetResponse,
  PublicationResponse,
  PublicationStats,
  VersionImportDocumentResponse,
  VersionListItemResponse,
} from "#v1/routes/publications/route-responses/publication.js";
export type { PublishedVersionResponse } from "#v1/routes/publications/route-responses/published-version.js";

export type GetPublicationsQuery = z.input<typeof GetPublicationsQuerySchema>;
export type PublicationListResponse = z.output<
  typeof PublicationListResponseSchema
>;
export type GetPublicationResponse = z.output<
  typeof GetPublicationResponseSchema
>;
export type CreatePublicationBody = z.input<typeof CreatePublicationBodySchema>;
export type CreatePublicationResponse = z.output<
  typeof CreatePublicationResponseSchema
>;
export type CreateDraftResponse = z.output<typeof CreateDraftResponseSchema>;
export type GetDraftResponse = z.output<typeof GetDraftResponseSchema>;
export type PatchDraftBody = z.input<typeof PatchPublicationPermissiveSchema>;
export type PatchDraftResponse = z.output<typeof PatchDraftResponseSchema>;
export type PostVersionBody = z.input<typeof PostVersionBodySchema>;
export type CandidateOrgResponse = z.output<typeof CandidateOrgResponseSchema>;
export type CandidateOrgListResponse = z.output<
  typeof CandidateOrgListResponseSchema
>;
export type GetDoiResponse = z.output<typeof GetDoiResponseSchema>;
export type DoiEligibilityResponse = z.output<
  typeof DoiEligibilityResponseSchema
>;
export type PostDoiResponse = z.output<typeof PostDoiResponseSchema>;
export type PutDoiBody = z.input<typeof PutDoiBodySchema>;
export type PutDoiResponse = z.output<typeof PutDoiResponseSchema>;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type NonOwnerUserResponse = z.output<typeof NonOwnerUserResponseSchema>;
export type CurrentUserResponse = z.output<typeof CurrentUserResponseSchema>;
export type GetUsersQuery = z.input<typeof GetUsersQuerySchema>;
export type UserListResponse = z.output<typeof UserListResponseSchema>;
export type GetMyPublicationListQuery = z.input<
  typeof GetMyPublicationListQuerySchema
>;
export type MyPublicationListItemResponse = z.output<
  typeof MyPublicationListItemResponseSchema
>;
export type MyPublicationListResponse = z.output<
  typeof MyPublicationListResponseSchema
>;

// ---------------------------------------------------------------------------
// Auth (better-auth's `/api/auth2`, outside v1)
// ---------------------------------------------------------------------------

export type { AdminUiClientHeaders } from "#src/lib/admin-ui-session.js";
export type { HandlerAuthInstance } from "#src/lib/auth.js";
