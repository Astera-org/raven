import { type Row } from "#v0/lib/db/db-select.js";

export interface ContributorAffiliation {
  org_id: number;
  name: string;
  slug: string;
  ror_id: string | null;
  avatar: string | null;
}

export interface Contributor {
  user_id: number;
  role: string;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
  in_byline: number;
  priority: number;
  affiliations: ContributorAffiliation[];
}

export interface MediaAsset {
  id: string;
  byteSize: number;
  mimeType: string;
  kind: "audio" | "file" | "image" | "video";
  publicUrl: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  rotation: number | null;
}

export interface VersionListItem {
  id: number;
  version_number: number;
  version_desc: string | null;
  doi: string | null;
  created_at: string;
}

export interface PubOrg {
  org_id: number;
  priority: number | null;
  slug: string;
  name: string;
  avatar: string | null;
}

/** Same shape as v1's `content`: the format clients render it in. */
export interface ContentResponse {
  format: string;
}

export interface PublicationResponse {
  abstract: string | null;
  body: string | null;
  contributors: Contributor[];
  created_at: string | null;
  doi: string | null;
  version_doi: string | null;
  feedback_form_embed_src: string | null;
  id: number;
  license: string | null;
  linked_assets: Array<{ type: string; url: string; name: string | null }>;
  mediaAssets: MediaAsset[];
  /** Omitted when the version has no recorded format. */
  content?: ContentResponse;
  orgs: Row[];
  pdf_url: string | null;
  publication_ulid: string;
  publisher: string;
  references: Array<{ url: string | null; text: string | null }>;
  slug: string;
  social_posts_count: number | null;
  social_posts_embed_src: string | null;
  state: string;
  subtitle: string | null;
  tags: string[];
  title: string | null;
  version_desc: string | null;
  version_number: number;
  versions: VersionListItem[];
}

export interface UserResponse {
  id: number;
  username: string | null;
  email?: string | null;
  first_name: string;
  last_name: string;
  avatar: string | null;
  profile?: string;
  orcid: string | null;
  created_at?: string;
  updated_at?: string;
  icon_color?: string;
}
