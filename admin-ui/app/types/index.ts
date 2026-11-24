import { type CurrentUserResponse } from "@raven/backend-ts/types";

export type ISODateString = string;

export interface Organization {
  slug: string;
  id: string;
  name: string;
  avatar?: string | null;
  profile?: string | null;
  rorId: string | null;
  doiPrefix?: string | null;
  unlisted?: boolean | null;
  canEdit?: boolean;
  createdAt: string | null;
  doiMintingEnabled?: number | boolean | null;
}

export type User = CurrentUserResponse;

export interface Contributor {
  user_id: number;
  avatar?: string;
  first_name: string;
  last_name: string;
  priority: number;
  // TODO: This should be an array of roles.
  role: string;
  in_byline: boolean;
  affiliations?: ContributorAffiliation[];
}

export interface ContributorAffiliation {
  org_id: number;
  name: string;
  slug: string;
  ror_id: string | null;
  avatar?: string | null;
}

export interface OrgOnPub {
  slug: string;
  org_id: number;
  name: string;
  avatar?: string | null;
  priority?: number | null;
}

export interface ContributorWithRoles extends Contributor {
  roles: string[];
  affiliations: ContributorAffiliation[];
}

export type Reference = {
  text: string;
  url: string;
};

export type PublicationState = "DRAFT" | "PUBLISHED" | "DELETED";

// UI order matches below order
export enum LinkedAssetType {
  Code = "Code",
  Data = "Data",
  CodeAndData = "Code + data",
  Material = "Material",
  Protocol = "Protocol",
  ThreeDPrinting = "3D printing design",
  CompanionPub = "Companion pub",
  Other = "Other",
}

export const LINKED_ASSET_TYPES: LinkedAssetType[] =
  Object.values(LinkedAssetType);

export interface LinkedAsset {
  type: LinkedAssetType;
  url: string;
  name?: string;
}

export interface Publication {
  id: number;
  slug: string;
  parent_id: number | null;
  template_id: number | null;
  latest_version_id: number | null;
  title: string;
  subtitle: string | null;
  abstract: string;
  doi: string | null;
  body: string;
  version_desc: string | null;
  version_number: number;
  version_id: number;
  state: PublicationState;
  license: string;
  created_at: string;
  updated_at: string | null;
  contributors: Contributor[];
  references: Reference[];
  pdf_url: string | null;
  num_comments?: number;
  social_posts_count?: number | null;
  feedback_form_embed_src?: string | null;
  social_posts_embed_src?: string | null;
  tags?: string[];
  linked_assets?: LinkedAsset[];
  orgs?: OrgOnPub[];
  // TODO: Why is this optional?
  versions?: VersionInfo[];
}

export interface UserPermissionsOnPublication {
  can_edit?: boolean;
  user_is_comments_admin?: boolean; // Can delete any comment
}

export interface Comment {
  comment_id: number;
  // TODO: this is not actually returned by the backend
  publication_id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  // TODO: Why is this optional?
  username?: string | null;
  parent_id: number | null;
  avatar?: string | null;
  body: string;
  anchor_text?: string | null;
  pre_text?: string | null;
  post_text?: string | null;
  created_at: string;
  updated_at: string | null;
  viewer_rating?: number | null;
  replies?: Comment[];
  version_id: number | null;
}

export interface CommentThread {
  root: Comment;
  replies: Comment[];
}

/**
 * Shape returned by GET /publications/my/drafts
 */
export interface DraftSummary {
  publication_id: number;
  slug: string;
  version_id: number;
  version_number: number;
  title: string | null;
  created_at: string;
}

export interface LoginResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface PreLinkResponse {
  state: string;
}

export type OrgMember = User & {
  role: string;
  start_at?: string | null;
  end_at?: string | null;
};

export interface Notification {
  id: number;
  user_id: number;
  publication_id: number;
  publication_slug: string;
  comment_id?: number;
  state: string;
  message: string;
  // 0 = unread, 1 = read.
  // TODO: Why is this a number? Change this to a boolean.
  seen: number;
  created_at: string;
}

export interface VersionInfo {
  id: number;
  version_number?: number;
  created_at: string;
  version_desc?: string;
}

export interface Heading {
  depth: number;
  hasChildren: boolean;
  id: string;
  text: string;
}
