import {
  getMdastCache,
  mdastCacheKey,
  MdastUnavailableError,
  type PublicationContent,
  withMessages,
} from "#src/lib/myst/mdast-cache.js";
import {
  MYST_AST_VERSION,
  toRequestedVersion,
} from "#src/lib/myst/versions.js";
import { createHash } from "node:crypto";
import { MDAST_MEDIA_TYPE } from "./negotiate-mdast.js";

export type MdastResponse =
  | { status: 200; body: string; headers: Record<string, string> }
  | { status: 304; headers: Record<string, string> }
  | { status: 422; error: string };

/**
 * The MyST AST representation of a version (see the contract in the
 * `initial-myst-support` skill). Drafts carry `messages` and are private;
 * published versions are cacheable for five minutes.
 */
export async function prepareMdastResponse({
  content,
  isDraft,
  schema,
  version,
  ifNoneMatch,
}: {
  content: PublicationContent;
  isDraft: boolean;
  schema: number;
  version: number | undefined;
  ifNoneMatch: string | undefined;
}): Promise<MdastResponse> {
  const servedVersion =
    version !== undefined && version < MYST_AST_VERSION
      ? version
      : MYST_AST_VERSION;
  const etag = mdastEtag({
    content,
    schema,
    version: servedVersion,
    isDraft,
  });
  const headers = {
    ETag: etag,
    Vary: "Accept",
    "Cache-Control": isDraft ? "private, no-cache" : "public, max-age=300",
  };

  if (etagMatches(ifNoneMatch, etag)) return { status: 304, headers };

  let cached;
  try {
    cached = getMdastCache().get(content);
  } catch (err) {
    if (err instanceof MdastUnavailableError) {
      return { status: 422, error: err.message };
    }
    throw err;
  }

  let json = cached.json;
  if (servedVersion < MYST_AST_VERSION) {
    const payload = JSON.parse(json);
    json = JSON.stringify(await toRequestedVersion(payload, servedVersion));
  }
  if (isDraft) json = withMessages(json, cached.messages);

  return {
    status: 200,
    body: json,
    headers: {
      ...headers,
      "Content-Type": `${MDAST_MEDIA_TYPE}; schema=${schema}; version=${servedVersion}`,
    },
  };
}

function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((tag) => tag.trim().replace(/^W\//, ""))
    .some((tag) => tag === "*" || tag === etag);
}

/**
 * The ETag of an AST representation, for `If-None-Match`. Unlike
 * `draftEtag`, which guards writes and covers only what a MyST `PUT`
 * replaces, it also covers the `schema` and AST `version` served and whether
 * it's a draft: the same content gives a different response when those
 * change, so reusing `draftEtag` would answer 304 for a stale AST.
 */
export function mdastEtag({
  content,
  schema,
  version,
  isDraft,
}: {
  content: PublicationContent;
  schema: number;
  version: number;
  isDraft: boolean;
}): string {
  return `"${createHash("sha256")
    .update(JSON.stringify([mdastCacheKey(content), schema, version, isDraft]))
    .digest("hex")}"`;
}
