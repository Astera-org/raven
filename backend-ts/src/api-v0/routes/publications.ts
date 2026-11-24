import { getConfig } from "#src/config.js";
import { getDb, type RavenDbClient } from "#src/db/index.js";
import { type VersionBibliography } from "#src/db/schema.js";
import {
  mintDoiForNewVersion,
  mintDoiForNewVersionDraft,
  mintDoisForNewPub,
  mintDoisForNewPubDraft,
  publishDraftDois,
} from "#src/lib/datacite/client.js";
import { DOI_REGEX } from "#src/lib/datacite/doi-regex.js";
import {
  contentFormat,
  isMystContent,
} from "#src/lib/importers/document-formats.js";
import { logger } from "#src/lib/logger.js";
import {
  MEDIA_IMPORT_IN_PROGRESS_MESSAGE,
  UNRESOLVED_MEDIA_REF_MESSAGE,
} from "#src/lib/media/constants.js";
import { uploadBodyMediaToS3 } from "#src/lib/media/upload-body-media-to-s3.js";
import {
  extractAndStoreReferencesFast,
  extractAndStoreVersionReferences,
} from "#src/lib/references.js";
import { DEFAULT_LICENSE } from "#src/lib/utils/licenses.js";
import { emptyToNull } from "#src/lib/utils/string.js";
import type { AppEnv } from "#src/types/hono.js";
import { newPublication } from "#v0/helpers/notifications-logic.js";
import {
  canCreatePublications,
  canDeleteCommentsOnPublication,
  dbDateStringToIso,
  generateUsername,
  getContributors,
  getMediaAssets,
  getNameFromOrcid,
  getOrgs,
  getPublicationsList,
  getSessionUserId,
  getTags,
  isDoiMintingEnabled,
  matchUsers,
} from "#v0/lib/rutils.js";
import { publicationToAgentMarkdown } from "#v0/lib/utils/publication-to-agent-markdown.js";
import { reconcileIntIdsToId } from "#v0/lib/utils/reconcile-int-id.js";
import {
  type ContentResponse,
  type Contributor,
  type PublicationResponse,
  type VersionListItem,
} from "#v0/types/response.js";
import { makeRepositories } from "#v1/db-repositories/index.js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { mediaType } from "@hapi/accept";
import {
  containsMediaRef,
  type MystFrontmatter,
} from "@raven/core-import-format";
import { sql, type SQL } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { type BlankInput } from "hono/types";
import { ulid } from "ulid";

const app = new Hono<AppEnv>();

type Row = Record<string, unknown>;

async function dbSelect(query: SQL, db: RavenDbClient): Promise<Row[]> {
  const [rows] = (await db.execute(query)) as unknown as [Row[]];
  return rows;
}
async function dbSelectValue(query: SQL, db: RavenDbClient): Promise<unknown> {
  const [rows] = (await db.execute(query)) as unknown as [
    Array<Record<string, unknown>>,
  ];
  const row = rows[0];
  return row ? (Object.values(row)[0] ?? null) : null;
}
async function dbInsert(query: SQL, db: RavenDbClient): Promise<number> {
  const [r] = (await db.execute(query)) as unknown as [{ insertId: number }];
  return r.insertId;
}
async function dbUpdate(query: SQL, db: RavenDbClient): Promise<void> {
  await db.execute(query);
}

/**
 * Serializes contributor edits on a version. Locking the version row rather
 * than the contributor row also covers the case where that row doesn't exist
 * yet, which would otherwise race on insert and on `priority`.
 */
async function lockVersionForContributorEdit(
  versionId: number,
  tx: RavenDbClient
): Promise<void> {
  await dbSelect(
    sql`SELECT id_int FROM versions WHERE id_int = ${versionId} FOR UPDATE`,
    tx
  );
}

const MAX_EMBED_SRC_LENGTH = 2048;

/** The `versions` columns `buildGetPublicationResponse` reads. */
const VERSION_RESPONSE_COLUMNS = sql`id_int, version_number, title, subtitle, abstract, body, version_desc, state, pdf_state, pdf_url, doi, created_at, import_document_format, import_document_url, import_document_filename, import_document_sync_date`;

class PutSlugTxError extends Error {
  constructor(
    public status: 400 | 500,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

function escapeXml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validateDoi(doi: string): string | null {
  return DOI_REGEX.test(doi) ? null : "DOI format is invalid";
}

function validateEmbedSrc(url: string): string | null {
  if (!url.startsWith("https://")) return "Embed URL must start with https://";
  if (url.length > MAX_EMBED_SRC_LENGTH)
    return `Embed URL must be ${MAX_EMBED_SRC_LENGTH} characters or less`;
  return null;
}

function validateSlug(slug: string, pubState?: string | null): string | null {
  if (pubState && pubState !== "DRAFT")
    return "Slug can only be updated while the publication is being drafted";
  if (!slug) return "Missing slug";
  if (slug.length > 255) return "Slug must be 255 characters or less";
  if (!/^[a-zA-Z0-9-]+$/.test(slug))
    return "Slug can only contain letters, numbers, and hyphens";
  if (slug.startsWith("-") || slug.endsWith("-"))
    return "Slug cannot start or end with hyphens";
  return null;
}

async function getPublicationBySlug(slug: string): Promise<Row | null> {
  const rows = await dbSelect(
    sql`SELECT id_int, id, slug, latest_version_number, owner_id_int, doi, state, license, metadata, feedback_form_embed_src, social_posts_embed_src, created_at FROM publications WHERE slug = ${slug}`,
    getDb()
  );
  return rows[0] ?? null;
}

function isDeletedNotRemoved(pubRow: Row): boolean {
  return (
    pubRow["state"] === "DELETED" &&
    (pubRow["latest_version_number"] == null || pubRow["doi"] == null)
  );
}

async function getDraftVersionId(
  publicationId: number,
  db: RavenDbClient
): Promise<number | null> {
  return (await dbSelectValue(
    sql`SELECT id_int FROM versions WHERE publication_id_int = ${publicationId} AND state = 'DRAFT' ORDER BY created_at DESC LIMIT 1`,
    db
  )) as number | null;
}

async function canEdit(
  userId: number | null,
  publicationId: number,
  ownerId: number
): Promise<boolean> {
  if (!userId || !publicationId) return false;
  const db = getDb();
  const isOrgPub = await dbSelectValue(
    sql`SELECT 1 FROM org_publication_map WHERE publication_id_int = ${publicationId}`,
    db
  );
  if (!isOrgPub) return ownerId === userId;
  return Boolean(
    await dbSelectValue(
      sql`SELECT 1 FROM org_publication_map oa INNER JOIN org_user_map ou ON ou.org_id_int = oa.org_id_int WHERE oa.publication_id_int = ${publicationId} AND ou.user_id_int = ${userId} AND (ou.end_at IS NULL OR ou.end_at > NOW()) AND (${userId} = ${ownerId} OR FIND_IN_SET('ADMIN', ou.roles)) LIMIT 1`,
      db
    )
  );
}

async function canViewDraft(
  userId: number | null,
  publicationId: number,
  ownerId: number
): Promise<boolean> {
  if (!userId || !publicationId) return false;
  const db = getDb();
  const isContrib = await dbSelectValue(
    sql`SELECT 1 FROM contributors c JOIN versions v ON v.id_int = c.version_id_int WHERE v.publication_id_int = ${publicationId} AND v.state = 'DRAFT' AND c.user_id_int = ${userId} LIMIT 1`,
    db
  );
  if (isContrib) return true;
  const isSiteAdmin = await dbSelectValue(
    sql`SELECT 1 FROM users WHERE id_int = ${userId} AND state = 'SITE_ADMIN' LIMIT 1`,
    db
  );
  if (isSiteAdmin) return true;
  const isOrgPub = await dbSelectValue(
    sql`SELECT 1 FROM org_publication_map WHERE publication_id_int = ${publicationId}`,
    db
  );
  if (!isOrgPub) return userId === ownerId;
  return Boolean(
    await dbSelectValue(
      sql`SELECT 1 FROM org_publication_map oa INNER JOIN org_user_map ou ON ou.org_id_int = oa.org_id_int WHERE oa.publication_id_int = ${publicationId} AND ou.user_id_int = ${userId} AND (ou.end_at IS NULL OR ou.end_at > NOW()) LIMIT 1`,
      db
    )
  );
}

/**
 * The format of the version's content, as in v1's `content`, so thestacks.org
 * can tell MyST versions apart. Left out when the version has no recorded
 * format, so existing responses do not change.
 */
function publicationContent(versionRow: Row): { content?: ContentResponse } {
  const format = contentFormat(
    versionRow["import_document_format"] as string | null
  );
  if (!format) return {};
  return { content: { format } };
}

async function buildGetPublicationResponse(
  pubRow: Row,
  versionRow: Row
): Promise<PublicationResponse> {
  const publicationId = pubRow["id_int"] as number;
  const versionId = versionRow["id_int"] as number;

  const db = getDb();
  const versionListRows = await dbSelect(
    sql`SELECT id_int, version_number, version_desc, doi, created_at FROM versions WHERE publication_id_int = ${publicationId} AND state = 'PUBLISHED' ORDER BY version_number DESC`,
    db
  );
  const versionList = versionListRows.map((r) => ({
    id: r["id_int"],
    version_number: r["version_number"],
    version_desc: r["version_desc"],
    doi: r["doi"],
    created_at: dbDateStringToIso(r["created_at"] as string),
  }));

  const [contributors, orgs, tags, mediaAssets] = await Promise.all([
    getContributors(versionId),
    getOrgs(publicationId),
    getTags(publicationId),
    getMediaAssets(versionId),
  ]);

  const refRows = await dbSelect(
    sql`SELECT r.url, r.text FROM version_references vr INNER JOIN \`references\` r ON r.id_int = vr.reference_id_int WHERE vr.version_id_int = ${versionId} ORDER BY vr.id_int`,
    db
  );
  const references = refRows.map((r) => ({ url: r["url"], text: r["text"] }));

  const linkedAssetRows = await dbSelect(
    sql`SELECT type, url, name FROM linked_assets WHERE version_id_int = ${versionId}`,
    db
  );
  const linked_assets = linkedAssetRows.map((r) => ({
    type: r["type"],
    url: r["url"],
    name: r["name"],
  }));

  let social_posts_count: number | null = null;
  const metadata = pubRow["metadata"];
  if (metadata && typeof metadata === "string") {
    try {
      const m = JSON.parse(metadata) as Record<string, unknown>;
      social_posts_count = (m["socialPostsCount"] as number | null) ?? null;
    } catch {
      /* ignore */
    }
  }

  return {
    abstract: versionRow["abstract"] as string | null,
    body: versionRow["body"] as string | null,
    contributors: contributors as unknown as Contributor[],
    created_at: dbDateStringToIso(pubRow["created_at"] as string),
    doi: pubRow["doi"] as string | null,
    version_doi: versionRow["doi"] as string | null,
    feedback_form_embed_src: pubRow["feedback_form_embed_src"] as string | null,
    id: publicationId,
    license: pubRow["license"] as string | null,
    ...publicationContent(versionRow),
    linked_assets: linked_assets as Array<{
      type: string;
      url: string;
      name: string | null;
    }>,
    mediaAssets,
    orgs,
    pdf_url: versionRow["pdf_url"] as string | null,
    publication_ulid: pubRow["id"] as string,
    publisher: getConfig().DATACITE_PUBLISHER,
    references: references as Array<{
      url: string | null;
      text: string | null;
    }>,
    slug: pubRow["slug"] as string,
    social_posts_count,
    social_posts_embed_src: pubRow["social_posts_embed_src"] as string | null,
    state: pubRow["state"] as string,
    subtitle: versionRow["subtitle"] as string | null,
    tags,
    title: versionRow["title"] as string | null,
    version_desc: versionRow["version_desc"] as string | null,
    version_number: versionRow["version_number"] as number,
    versions: versionList as VersionListItem[],
  };
}

/**
 * What `extractAndStoreVersionReferences` needs besides the text: MyST
 * versions store references in their AST's citation order, and their
 * citations may name entries of the version's own bibliography. The JSON
 * columns are read as text, since the driver's own parsing of a JSON column is
 * not relied on elsewhere here. `frontmatter` doesn't change the references; it
 * is passed so the AST built for them is the one the cache serves.
 */
async function getVersionReferenceInput(
  versionId: number,
  db: RavenDbClient
): Promise<{
  format: string | null;
  bibliography: VersionBibliography | null;
  frontmatter: MystFrontmatter | null;
}> {
  const rows = await dbSelect(
    sql`SELECT import_document_format, CAST(bibliography AS CHAR) AS bibliography, CAST(frontmatter AS CHAR) AS frontmatter FROM versions WHERE id_int = ${versionId}`,
    db
  );
  const row = rows[0];
  const bibliography = row?.["bibliography"] as string | null | undefined;
  const frontmatter = row?.["frontmatter"] as string | null | undefined;
  return {
    format: (row?.["import_document_format"] as string | null) ?? null,
    bibliography: bibliography
      ? (JSON.parse(bibliography) as VersionBibliography)
      : null,
    frontmatter: frontmatter
      ? (JSON.parse(frontmatter) as MystFrontmatter)
      : null,
  };
}

async function getDraftVersionIdOrCreateNew(
  publicationId: number,
  latestVersionNumber: number,
  db: RavenDbClient
): Promise<[number, boolean]> {
  const existing = await getDraftVersionId(publicationId, db);
  if (existing) return [existing, false];

  // The JSON columns are read as text so they can be passed straight back as a
  // parameter: the driver would escape a parsed object as `key = value` pairs.
  const latestRows = await dbSelect(
    sql`SELECT id_int, id, title, subtitle, abstract, body, CAST(bibliography AS CHAR) AS bibliography, CAST(frontmatter AS CHAR) AS frontmatter, import_document_body, import_document_url, import_document_filename, import_document_format, import_document_sync_date FROM versions WHERE publication_id_int = ${publicationId} AND version_number = ${latestVersionNumber}`,
    db
  );
  if (latestRows.length === 0)
    throw new Error(
      `No version ${latestVersionNumber} found for publication ${publicationId}`
    );
  const latest = latestRows[0]!;
  const latestVersionId = latest["id_int"] as number;
  const latestVersionUlid = latest["id"] as string;

  const publicationUlid = (await dbSelectValue(
    sql`SELECT id FROM publications WHERE id_int = ${publicationId}`,
    db
  )) as string | null;

  const draftVersionUlid = ulid();
  let draftVersionId: number;
  try {
    draftVersionId = await dbInsert(
      sql`INSERT INTO versions (publication_id_int, version_number, title, subtitle, abstract, body, bibliography, frontmatter, import_document_body, import_document_url, import_document_filename, import_document_format, import_document_sync_date, state, id, publication_id) VALUES (${publicationId}, ${latestVersionNumber + 1}, ${(latest["title"] as string | null) || null}, ${(latest["subtitle"] as string | null) || null}, ${(latest["abstract"] as string | null) || null}, ${(latest["body"] as string | null) || null}, ${(latest["bibliography"] as string | null) ?? null}, ${(latest["frontmatter"] as string | null) ?? null}, ${(latest["import_document_body"] as string | null) ?? null}, ${(latest["import_document_url"] as string | null) ?? null}, ${(latest["import_document_filename"] as string | null) ?? null}, ${(latest["import_document_format"] as string | null) ?? null}, ${(latest["import_document_sync_date"] as string | null) ?? null}, 'DRAFT', ${draftVersionUlid}, ${publicationUlid})`,
      db
    );
  } catch {
    const retry = await getDraftVersionId(publicationId, db);
    if (retry) return [retry, false];
    throw new Error(
      `Failed to create a new draft for publication ${publicationId}`
    );
  }

  if (!draftVersionId) {
    const retry = await getDraftVersionId(publicationId, db);
    if (retry) return [retry, false];
    throw new Error(
      `Failed to create a new draft for publication ${publicationId}`
    );
  }

  await Promise.all([
    dbUpdate(
      sql`INSERT INTO version_references (version_id_int, reference_id_int, id) SELECT ${draftVersionId}, reference_id_int, ULID() FROM version_references WHERE version_id_int = ${latestVersionId}`,
      db
    ),
    dbUpdate(
      sql`INSERT INTO linked_assets (version_id_int, type, url, name) SELECT ${draftVersionId}, type, url, name FROM linked_assets WHERE version_id_int = ${latestVersionId}`,
      db
    ),
    dbUpdate(
      sql`INSERT INTO contributors (version_id_int, user_id_int, roles, in_byline, priority) SELECT ${draftVersionId}, user_id_int, roles, in_byline, priority FROM contributors WHERE version_id_int = ${latestVersionId}`,
      db
    ),
    dbUpdate(
      sql`INSERT INTO contributor_affiliations (version_id_int, user_id_int, affiliated_org_id_int, id) SELECT ${draftVersionId}, user_id_int, affiliated_org_id_int, ULID() FROM contributor_affiliations WHERE version_id_int = ${latestVersionId}`,
      db
    ),
    dbUpdate(
      sql`INSERT INTO version_media_asset_map (version_id, media_asset_id) SELECT ${draftVersionUlid}, media_asset_id FROM version_media_asset_map WHERE version_id = ${latestVersionUlid}`,
      db
    ),
  ]);

  return [draftVersionId, true];
}

function triggerPdfGeneration(slug: string, versionNumber: number): void {
  const cfg = getConfig();
  if (!cfg.PDF_QUEUE_URL) return;
  const client = new SQSClient({
    region: cfg.AWS_REGION,
    credentials: cfg.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: cfg.AWS_ACCESS_KEY_ID,
          secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
  client
    .send(
      new SendMessageCommand({
        QueueUrl: cfg.PDF_QUEUE_URL,
        MessageBody: JSON.stringify({ slug, versionNumber }),
      })
    )
    .catch((e: unknown) =>
      logger.error({ err: e }, "Failed to send PDF generation message")
    );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/my/drafts", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const page = Math.max(parseInt(query["page"] ?? "1", 10) || 1, 1);
  const perPage = Math.min(parseInt(query["per_page"] ?? "10", 10) || 10, 100);
  const offset = (page - 1) * perPage;
  const db = getDb();
  const total =
    ((await dbSelectValue(
      sql`SELECT COUNT(DISTINCT p.id_int) FROM publications p JOIN versions v ON v.publication_id_int = p.id_int WHERE p.owner_id_int = ${userId} AND v.state = 'DRAFT'`,
      db
    )) as number) || 0;
  const rows = await dbSelect(
    sql`SELECT p.id_int as publication_id_int, p.slug as slug, v.id_int as version_id_int, v.version_number, v.title as title, v.created_at as created_at FROM publications p JOIN versions v ON v.publication_id_int = p.id_int WHERE p.owner_id_int = ${userId} AND v.state = 'DRAFT' GROUP BY p.id_int, v.id_int ORDER BY p.created_at DESC LIMIT ${perPage} OFFSET ${offset}`,
    db
  );
  return c.json({
    pagination: { total, page, per_page: perPage },
    items: reconcileIntIdsToId(rows),
  });
});

app.get("/potential_orgs", async (c) => {
  const slug = c.req.query("slug");
  if (!slug) return c.json({ error: "Missing slug parameter" }, 400);
  const userId = await getSessionUserId(c);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow || pubRow["state"] === "DELETED")
    return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);
  const rows = await dbSelect(
    sql`SELECT DISTINCT o.id_int, o.name, o.slug, o.avatar FROM organizations o JOIN org_user_map ou ON ou.org_id_int = o.id_int WHERE (ou.user_id_int = ${ownerId} OR ou.user_id_int IN (SELECT c.user_id_int FROM contributors c WHERE c.version_id_int = (SELECT id_int FROM versions WHERE publication_id_int = ${publicationId} ORDER BY version_number DESC LIMIT 1))) AND (ou.end_at IS NULL OR ou.end_at > NOW())`,
    getDb()
  );

  return c.json(reconcileIntIdsToId(rows));
});

app.get("/rss/:org_slug", async (c) => {
  const orgSlug = c.req.param("org_slug");
  const domain = c.req.query("domain") ?? "thestacks.org";
  const db = getDb();
  const orgRows = await dbSelect(
    sql`SELECT id_int, name FROM organizations WHERE LOWER(name) = LOWER(${orgSlug}) OR LOWER(REPLACE(name, ' ', '-')) = LOWER(${orgSlug})`,
    db
  );
  if (orgRows.length === 0)
    return c.var.jsonErrors({ organization: ["Organization not found"] }, 404);
  const orgId = orgRows[0]!["id_int"] as number;
  const orgName = orgRows[0]!["name"] as string;

  const publications = await dbSelect(
    sql`SELECT DISTINCT p.id_int, p.slug, p.created_at, v.title, v.subtitle, GROUP_CONCAT(DISTINCT pt.tag) AS tags, (SELECT COUNT(*) FROM comments c WHERE c.publication_id_int = p.id_int AND c.state IN ('PUBLISHED', 'WITHDRAWN')) AS num_comments FROM publications p JOIN versions v ON v.publication_id_int = p.id_int AND v.version_number = p.latest_version_number JOIN org_publication_map m ON m.publication_id_int = p.id_int LEFT JOIN publication_tags pt ON pt.publication_id_int = p.id_int WHERE p.state = 'PUBLISHED' AND v.state = 'PUBLISHED' AND m.org_id_int = ${orgId} GROUP BY p.id_int, p.slug, p.created_at, v.title, v.subtitle ORDER BY p.created_at DESC, p.id_int DESC`,
    db
  );

  const items = publications.map((pub) => {
    const tags = pub["tags"]
      ? String(pub["tags"])
          .split(",")
          .map((t) => t.trim())
      : [];
    const categories = tags
      .map((t) => `            <category>${escapeXml(t)}</category>`)
      .join("\n");
    return `\n        <item>\n            <title>${escapeXml(String(pub["title"] ?? "Untitled"))}</title>\n            <link>https://${domain}/publications/${pub["slug"]}</link>\n            <description>${escapeXml(String(pub["subtitle"] ?? ""))}</description>\n            <pubDate>${pub["created_at"]}</pubDate>\n${categories}\n            <numComments>${pub["num_comments"]}</numComments>\n        </item>`;
  });

  const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <channel>\n        <title>${escapeXml(orgName)} Publications</title>\n        <link>https://${domain}</link>\n        <description>Latest publications from ${escapeXml(orgName)}</description>\n${items.join("\n")}\n    </channel>\n</rss>`;
  return c.text(rss, 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
  });
});

app.get("/", async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const searchTerm = (query["q"] ?? "").trim().toLowerCase();
  const tag = (query["t"] ?? "").trim().toLowerCase();
  let result;
  if (tag) {
    result = await getPublicationsList(
      query,
      searchTerm,
      sql`JOIN publication_tags at ON at.publication_id_int = p.id_int`,
      sql` AND at.tag = ${tag}`
    );
  } else {
    result = await getPublicationsList(query, searchTerm);
  }
  return c.json(result);
});

app.post("/", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const db = getDb();
  const userRows = await dbSelect(
    sql`SELECT id_int, id, state FROM users WHERE id_int = ${userId}`,
    db
  );
  if (
    userRows.length === 0 ||
    !(await canCreatePublications(userId, userRows[0]!["state"] as string))
  ) {
    return c.json({ error: "Permission denied" }, 403);
  }
  const ownerUlid = userRows[0]!["id"] as string | null;

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const slug = ((body["slug"] as string) ?? "").trim().toLowerCase();
  const doi = emptyToNull(body["doi"] as string | null);
  if (doi) {
    const err = validateDoi(doi);
    if (err) return c.json({ error: err }, 400);
  }
  const title = emptyToNull(body["title"] as string | null);
  const subtitle = emptyToNull(body["subtitle"] as string | null);
  const abstract = emptyToNull(body["abstract"] as string | null);
  const bodyText = emptyToNull(body["body"] as string | null);
  const version_desc = emptyToNull(body["version_desc"] as string | null);
  const license = emptyToNull(body["license"] as string | null) ?? "CC BY";
  const feedback_form_embed_src = emptyToNull(
    body["feedback_form_embed_src"] as string | null
  );
  const social_posts_embed_src = emptyToNull(
    body["social_posts_embed_src"] as string | null
  );

  const slugErr = validateSlug(slug);
  if (slugErr) return c.json({ error: slugErr }, 400);
  const existingSlug = await getPublicationBySlug(slug);
  if (existingSlug) return c.json({ error: "Slug already exists" }, 409);
  if (!title && !abstract && !bodyText)
    return c.json({ error: "Missing title, abstract, or body" }, 400);
  for (const embedVal of [feedback_form_embed_src, social_posts_embed_src]) {
    if (embedVal) {
      const err = validateEmbedSrc(embedVal);
      if (err) return c.json({ error: err }, 400);
    }
  }
  if (subtitle && subtitle.length > 300)
    return c.json({ error: "Subtitle must be 300 characters or less" }, 400);

  let uploadedBody = bodyText;
  const pubUlid = ulid();
  const versionUlid = ulid();

  let publicationId: number;
  let versionId: number;
  try {
    [publicationId, versionId] = await db.transaction(async (tx) => {
      const publicationId = await dbInsert(
        sql`INSERT INTO publications (slug, doi, owner_id_int, license, feedback_form_embed_src, social_posts_embed_src, state, id, owner_id) VALUES (${slug}, ${doi}, ${userId}, ${license}, ${feedback_form_embed_src}, ${social_posts_embed_src}, 'DRAFT', ${pubUlid}, ${ownerUlid})`,
        tx
      );
      const versionId = await dbInsert(
        sql`INSERT INTO versions (publication_id_int, title, subtitle, abstract, body, version_desc, state, id, publication_id) VALUES (${publicationId}, ${title}, ${subtitle}, ${abstract}, ${uploadedBody}, ${version_desc}, 'DRAFT', ${versionUlid}, ${pubUlid})`,
        tx
      );
      if (bodyText) {
        try {
          uploadedBody =
            (await uploadBodyMediaToS3({
              body: bodyText,
              publicationId: pubUlid,
              versionId: versionUlid,
              repos: makeRepositories().withTx(tx),
            })) ?? uploadedBody;

          /**
           * In order to insert into version_media_asset_map, the version
           * needs to have already been persisted, otherwise there's an Foreign
           * Key error.
           *
           * But since uploading the media updates the body, we need to update
           * it in the database here.
           */
          await dbUpdate(
            sql`UPDATE versions SET body = ${uploadedBody} where id_int = ${versionId}`,
            tx
          );
        } catch (e) {
          c.var.logger.error({ err: e }, "Media upload failed");
          throw new PutSlugTxError(400, String(e), { cause: e });
        }
      }

      return [publicationId, versionId];
    });
  } catch (e) {
    if (e instanceof PutSlugTxError) {
      // ROLLBACK has already run by this point
      return c.json({ error: e.message }, e.status);
    }
    throw e;
  }

  const log = c.var.logger;
  extractAndStoreReferencesFast(
    versionId,
    `${abstract ?? ""}\n${uploadedBody ?? ""}`
  ).catch((e) =>
    log.error({ err: e }, "Failed to extract and store references")
  );

  return c.json(
    { publication_id: publicationId, slug, version_id: versionId },
    201
  );
});

app.post("/add_contrib", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const slug = body["slug"] as string;
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  const identifier = body["username"] as string;
  if (!identifier) return c.json({ error: "Missing username" }, 400);

  const role = body["role"] as string;
  if (!role) return c.json({ error: "Missing role" }, 400);

  const users = await matchUsers(identifier, { usernameExact: true });
  if (users.length > 1) return c.json({ error: "Multiple users found" }, 409);

  let username: string;
  const db = getDb();
  if (users.length === 0) {
    if (identifier.includes(" ")) {
      const [firstName, lastName] = identifier.split(" ", 2) as [
        string,
        string,
      ];
      username = await generateUsername(db, firstName, lastName);
      const name = `${firstName} ${lastName}`;
      await dbInsert(
        sql`INSERT INTO users (username, first_name, last_name, name, id) VALUES (${username}, ${firstName}, ${lastName}, ${name}, ULID())`,
        db
      );
    } else if (identifier.includes("-")) {
      const [firstName, lastName] = await getNameFromOrcid(identifier);
      if (!firstName || !lastName)
        return c.json({ error: "Unknown user" }, 404);
      username = await generateUsername(db, firstName, lastName);
      const name = `${firstName} ${lastName}`;
      await dbInsert(
        sql`INSERT INTO users (username, first_name, last_name, name, orcid, id) VALUES (${username}, ${firstName}, ${lastName}, ${name}, ${identifier}, ULID())`,
        db
      );
    } else {
      return c.json({ error: "Unknown user" }, 404);
    }
  } else {
    username = (users[0] as Record<string, unknown>)["username"] as string;
  }

  const contributorRows = await dbSelect(
    sql`SELECT id_int, id FROM users WHERE username = ${username} LIMIT 1`,
    db
  );
  if (contributorRows.length === 0)
    return c.json({ error: "User not found" }, 404);
  const contributorId = contributorRows[0]!["id_int"] as number;
  const contributorUlid = contributorRows[0]!["id"] as string;

  // Contributors belong to a version, so like other edits this lands in the
  // draft, starting one from the latest version if there isn't one yet.
  const [versionId] = await getDraftVersionIdOrCreateNew(
    publicationId,
    pubRow["latest_version_number"] as number,
    db
  );
  const inByline = Boolean(body["in_byline"]);

  const alreadyHasRole = await db.transaction(async (tx) => {
    await lockVersionForContributorEdit(versionId, tx);
    const existing = await dbSelect(
      sql`SELECT roles FROM contributors WHERE version_id_int = ${versionId} AND user_id_int = ${contributorId} LIMIT 1`,
      tx
    );
    if (existing.length === 0) {
      await dbInsert(
        sql`INSERT INTO contributors (version_id_int, user_id_int, user_id, roles, in_byline, priority) SELECT ${versionId}, ${contributorId}, ${contributorUlid}, JSON_ARRAY(${role}), ${inByline ? 1 : 0}, COALESCE(MAX(priority), 0) + 1 FROM contributors WHERE version_id_int = ${versionId}`,
        tx
      );
      return false;
    }

    const roles = existing[0]!["roles"] as string[];
    if (roles.includes(role)) return true;
    await dbUpdate(
      sql`UPDATE contributors SET roles = ${JSON.stringify([...roles, role])}, in_byline = in_byline OR ${inByline ? 1 : 0} WHERE version_id_int = ${versionId} AND user_id_int = ${contributorId}`,
      tx
    );
    return false;
  });
  if (alreadyHasRole)
    return c.json({ error: "Contributor already exists" }, 409);
  return c.json({ publication_id: publicationId });
});

app.post("/remove_contrib", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const slug = body["slug"] as string;
  const contributorId = body["user_id"] as number;
  const role = body["role"] as string;
  if (!contributorId) return c.json({ error: "Missing user_id" }, 400);
  if (!role) return c.json({ error: "Missing role" }, 400);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);
  const db = getDb();
  const [versionId] = await getDraftVersionIdOrCreateNew(
    publicationId,
    pubRow["latest_version_number"] as number,
    db
  );

  await db.transaction(async (tx) => {
    await lockVersionForContributorEdit(versionId, tx);
    const existing = await dbSelect(
      sql`SELECT roles FROM contributors WHERE version_id_int = ${versionId} AND user_id_int = ${contributorId} LIMIT 1`,
      tx
    );
    const row = existing[0];
    if (!row) return;

    const remainingRoles = (row["roles"] as string[]).filter((r) => r !== role);
    if (remainingRoles.length > 0) {
      await dbUpdate(
        sql`UPDATE contributors SET roles = ${JSON.stringify(remainingRoles)} WHERE version_id_int = ${versionId} AND user_id_int = ${contributorId}`,
        tx
      );
    } else {
      await dbUpdate(
        sql`DELETE FROM contributors WHERE version_id_int = ${versionId} AND user_id_int = ${contributorId}`,
        tx
      );
    }
  });
  return c.json({ publication_id: publicationId });
});

app.post("/add_org", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const slug = body["slug"] as string;
  const orgId = body["org_id"] as number;
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);
  const db = getDb();
  const orgRows = await dbSelect(
    sql`SELECT id FROM organizations WHERE id_int = ${orgId} LIMIT 1`,
    db
  );
  if (orgRows.length === 0) return c.json({ error: "Org not found" }, 404);
  const orgUlid = orgRows[0]!["id"] as string | null;
  const alreadyMapped = await dbSelectValue(
    sql`SELECT 1 FROM org_publication_map WHERE publication_id_int = ${publicationId} AND org_id_int = ${orgId} LIMIT 1`,
    db
  );
  if (!alreadyMapped)
    await dbInsert(
      sql`INSERT INTO org_publication_map (publication_id_int, org_id_int, publication_id, org_id) VALUES (${publicationId}, ${orgId}, ${pubRow["id"] ?? null}, ${orgUlid})`,
      db
    );
  return c.json({ publication_id: publicationId });
});

app.post("/remove_org", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const slug = body["slug"] as string;
  const orgId = body["org_id"] as number;
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);
  await dbUpdate(
    sql`DELETE FROM org_publication_map WHERE publication_id_int = ${publicationId} AND org_id_int = ${orgId}`,
    getDb()
  );
  return c.json({ publication_id: publicationId });
});

app.get("/:slug/user_perms", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow || pubRow["state"] === "DELETED")
    return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  const response: Record<string, boolean> = {};
  if (await canEdit(userId, publicationId, ownerId))
    response["can_edit"] = true;
  if (await canDeleteCommentsOnPublication(publicationId, userId ?? 0))
    response["user_is_comments_admin"] = true;
  return c.json(response);
});

app.get("/:slug/draft", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow || pubRow["state"] === "DELETED")
    return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;

  const db = getDb();
  const draftVersionId = await getDraftVersionId(publicationId, db);
  if (!draftVersionId) return c.json({ error: "No draft found" }, 404);

  const versionRows = await dbSelect(
    sql`SELECT ${VERSION_RESPONSE_COLUMNS} FROM versions WHERE id_int = ${draftVersionId}`,
    db
  );
  if (versionRows.length === 0)
    return c.json({ error: "Draft version not found" }, 404);
  const versionRow = versionRows[0]!;

  if (!(await canViewDraft(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  const publication = await buildGetPublicationResponse(pubRow, versionRow);
  return c.json({ publication });
});

app.post("/:slug/draft", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow || pubRow["state"] === "DELETED")
    return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  let draftVersionId: number;
  let wasCreated: boolean;
  const db = getDb();
  try {
    [draftVersionId, wasCreated] = await getDraftVersionIdOrCreateNew(
      publicationId,
      pubRow["latest_version_number"] as number,
      db
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No version ")) {
      return c.json({ error: "Latest version not found" }, 404);
    }
    c.var.logger.error({ err: e }, "Failed to get/create draft");
    return c.json({ error: "Draft could not be created" }, 500);
  }

  const versionRows = await dbSelect(
    sql`SELECT ${VERSION_RESPONSE_COLUMNS} FROM versions WHERE id_int = ${draftVersionId}`,
    db
  );
  const publication = await buildGetPublicationResponse(
    pubRow,
    versionRows[0]!
  );
  return c.json({ publication }, wasCreated ? 201 : 200);
});

app.delete("/:slug/draft", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);
  const db = getDb();
  const draftVersionId = await getDraftVersionId(publicationId, db);
  if (!draftVersionId) return c.json({ error: "No draft found" }, 404);
  await dbUpdate(
    sql`UPDATE versions SET state = 'DELETED' WHERE id_int = ${draftVersionId}`,
    db
  );
  return c.body(null, 204);
});

app.post("/:slug/publish", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  const db = getDb();
  const draftRows = await dbSelect(
    sql`SELECT id_int, id, version_number, title, subtitle, abstract, body, version_desc, doi FROM versions WHERE publication_id_int = ${publicationId} AND state = 'DRAFT' ORDER BY created_at DESC LIMIT 1`,
    db
  );
  if (draftRows.length === 0) return c.json({ error: "No draft found" }, 400);
  const draft = draftRows[0]!;
  const versionId = draft["id_int"] as number;
  const versionUlid = draft["id"] as string;
  const versionNumber = draft["version_number"] as number;
  const title = draft["title"] as string;
  const subtitle = draft["subtitle"] as string | null;
  const abstract = draft["abstract"] as string;
  const bodyText = draft["body"] as string;
  const versionDesc = draft["version_desc"] as string | null;
  const existingVersionDoi = draft["doi"] as string | null;
  const license = (pubRow["license"] as string | null) ?? DEFAULT_LICENSE;

  if (!title || !bodyText)
    return c.json({ error: "Missing title or body" }, 400);
  // Publishing rewrites the body, which would race the media import worker.
  const pubUlid = pubRow["id"] as string;
  if (await makeRepositories().imports.hasUnsettledMediaImport(pubUlid))
    return c.json({ error: MEDIA_IMPORT_IN_PROGRESS_MESSAGE }, 409);
  if (containsMediaRef(bodyText))
    return c.json({ error: UNRESOLVED_MEDIA_REF_MESSAGE }, 400);

  let uploadedBody = bodyText;
  try {
    uploadedBody =
      (await uploadBodyMediaToS3({
        body: bodyText,
        publicationId: pubUlid,
        versionId: versionUlid,
        repos: makeRepositories(),
      })) ?? uploadedBody;
  } catch (e) {
    c.var.logger.error({ err: e }, "Media upload failed");
    return c.json({ error: String(e) }, 400);
  }

  const now = new Date();
  const publishDate = now.toISOString().slice(0, 10);
  const nowStr = now.toISOString().slice(0, 19).replace("T", " ");

  await dbUpdate(
    sql`UPDATE versions SET body = ${uploadedBody}, state = 'PUBLISHED', created_at = ${nowStr} WHERE id_int = ${versionId}`,
    db
  );

  if (versionNumber === 1) {
    await dbUpdate(
      sql`UPDATE publications SET state = 'PUBLISHED', latest_version_number = ${versionNumber}, created_at = ${nowStr} WHERE id_int = ${publicationId}`,
      db
    );
  } else {
    await dbUpdate(
      sql`UPDATE publications SET state = 'PUBLISHED', latest_version_number = ${versionNumber} WHERE id_int = ${publicationId}`,
      db
    );
  }

  let canonicalDoi = pubRow["doi"] as string | null;
  let versionDoi = existingVersionDoi;

  const log = c.var.logger;
  const {
    format: versionFormat,
    bibliography,
    frontmatter,
  } = await getVersionReferenceInput(versionId, db);
  try {
    await extractAndStoreVersionReferences(versionId, {
      format: versionFormat,
      bibliography,
      frontmatter,
      abstract,
      body: uploadedBody,
    });
  } catch (e) {
    log.error({ err: e }, "Failed to extract and store references");
  }

  if (await isDoiMintingEnabled(publicationId)) {
    try {
      if (canonicalDoi && existingVersionDoi) {
        const published = await publishDraftDois(
          makeRepositories(),
          pubUlid,
          versionUlid,
          {
            slug,
            title,
            subtitle: subtitle ?? "",
            abstract: abstract ?? "",
            license,
            versionNumber,
            versionDesc: versionDesc ?? "",
            publishDate,
            canonicalDoi,
            versionDoi: existingVersionDoi,
          }
        );
        if (published === "inaccessible") {
          // Clear the association only after confirmed access denial.
          // Operational failures must preserve the existing DOI for recovery.
          await dbUpdate(
            sql`UPDATE versions SET doi = NULL WHERE id_int = ${versionId}`,
            db
          );
          versionDoi = null;
        }
      } else if (!canonicalDoi && title) {
        const [cDoi, vDoi] = await mintDoisForNewPub(
          makeRepositories(),
          pubUlid,
          versionUlid,
          {
            slug,
            title,
            subtitle: subtitle ?? "",
            abstract: abstract ?? "",
            license,
            versionDesc: versionDesc ?? "",
            publishDate,
          }
        );
        if (cDoi) {
          await dbUpdate(
            sql`UPDATE publications SET doi = ${cDoi} WHERE id_int = ${publicationId}`,
            db
          );
          canonicalDoi = cDoi;
        }
        if (vDoi) {
          await dbUpdate(
            sql`UPDATE versions SET doi = ${vDoi} WHERE id_int = ${versionId}`,
            db
          );
          versionDoi = vDoi;
        }
      } else if (canonicalDoi && title) {
        const vDoi = await mintDoiForNewVersion(
          makeRepositories(),
          pubUlid,
          versionUlid,
          {
            slug,
            title,
            subtitle: subtitle ?? "",
            abstract: abstract ?? "",
            license: pubRow["license"] as string,
            versionNumber,
            versionDesc: versionDesc ?? "",
            publishDate,
            canonicalDoi,
            // Actually publishing a version must always bring the concept
            // DOI's metadata in line with the newly published version.
            updateCanonical: true,
          }
        );
        if (vDoi) {
          await dbUpdate(
            sql`UPDATE versions SET doi = ${vDoi} WHERE id_int = ${versionId}`,
            db
          );
          versionDoi = vDoi;
        }
      }
    } catch (e) {
      c.var.logger.error({ err: e }, "DOI minting error");
    }
  }

  // MyST versions get no PDF (see the initial-myst-support skill).
  if (!isMystContent(versionFormat)) triggerPdfGeneration(slug, versionNumber);
  newPublication(publicationId, versionId, title).catch((e) =>
    log.error({ err: e }, "Failed to send new publication notifications")
  );

  return c.json({
    publication_id: publicationId,
    slug,
    version_number: versionNumber,
    state: "PUBLISHED",
    doi: canonicalDoi,
    version_doi: versionDoi,
  });
});

app.post("/:slug/tags", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const newTags = body["tags"];
  if (!Array.isArray(newTags))
    return c.json({ error: "Invalid tags format. Expected a list." }, 400);
  const newTagSet = [
    ...new Set((newTags as string[]).map((t) => t.toLowerCase())),
  ];

  const db = getDb();
  const oldTagRows = await dbSelect(
    sql`SELECT tag FROM publication_tags WHERE publication_id_int = ${publicationId}`,
    db
  );
  const oldTags = oldTagRows.map((r) => String(r["tag"]).toLowerCase());

  for (const tag of oldTags) {
    if (!newTagSet.includes(tag))
      await dbUpdate(
        sql`DELETE FROM publication_tags WHERE publication_id_int = ${publicationId} AND tag = ${tag}`,
        db
      );
  }
  const pubUlidForTags = pubRow["id"] as string | null;
  for (const tag of newTagSet) {
    if (!oldTags.includes(tag))
      await dbInsert(
        sql`INSERT INTO publication_tags (publication_id_int, tag, publication_id) VALUES (${publicationId}, ${tag}, ${pubUlidForTags})`,
        db
      );
  }
  return c.json({ publication_id: publicationId });
});

app.post("/:slug/linked-assets", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  const db = getDb();
  const versionId = (await dbSelectValue(
    sql`SELECT id_int FROM versions WHERE publication_id_int = ${publicationId} AND state = 'DRAFT' ORDER BY created_at DESC LIMIT 1`,
    db
  )) as number | null;
  if (!versionId)
    return c.json({ error: "No draft found for this publication" }, 422);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const linkedAssets =
    (body["linked_assets"] as Array<Record<string, string>>) ?? [];
  if (!Array.isArray(linkedAssets))
    return c.json({ error: "Invalid input: expected a list of assets" }, 400);

  await dbUpdate(
    sql`DELETE FROM linked_assets WHERE version_id_int = ${versionId}`,
    db
  );
  if (linkedAssets.length > 0) {
    const valueParts = linkedAssets.map(
      (a) =>
        sql`(${versionId}, ${a["type"] ?? ""}, ${a["url"] ?? ""}, ${a["name"] ?? ""})`
    );
    await dbInsert(
      sql`INSERT INTO linked_assets (version_id_int, type, url, name) VALUES ${sql.join(valueParts, sql`, `)}`,
      db
    );
  }
  return c.json({ publication_id: publicationId, version_id: versionId });
});

app.post("/:slug/contrib-affiliation", async (c) => {
  const slug = c.req.param("slug");
  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const contributorUserId = body["user_id"] as number;
  const orgSlug = body["org_slug"] as string;
  if (!contributorUserId || !orgSlug)
    return c.json({ error: "Missing user_id or org_slug" }, 400);

  const userId = await getSessionUserId(c);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  const db = getDb();
  const versionId = await getDraftVersionId(publicationId, db);
  if (!versionId) return c.json({ error: "No draft version found" }, 400);

  const isContrib = await dbSelectValue(
    sql`SELECT 1 FROM contributors WHERE version_id_int = ${versionId} AND user_id_int = ${contributorUserId} LIMIT 1`,
    db
  );
  if (!isContrib) return c.json({ error: "User is not a contributor" }, 400);

  const orgAffRows = await dbSelect(
    sql`SELECT id_int, id FROM organizations WHERE slug = ${orgSlug} AND state = 'ACTIVE' LIMIT 1`,
    db
  );
  if (orgAffRows.length === 0)
    return c.json({ error: "Organization not found" }, 404);
  const orgId = orgAffRows[0]!["id_int"] as number;
  const orgAffUlid = orgAffRows[0]!["id"] as string | null;

  const exists = await dbSelectValue(
    sql`SELECT 1 FROM contributor_affiliations WHERE version_id_int = ${versionId} AND user_id_int = ${contributorUserId} AND affiliated_org_id_int = ${orgId} LIMIT 1`,
    db
  );
  if (exists) return c.json({ error: "Affiliation already exists" }, 409);

  const versionUlid = await dbSelectValue(
    sql`SELECT id FROM versions WHERE id_int = ${versionId}`,
    db
  );
  const contributorUserUlid = await dbSelectValue(
    sql`SELECT id FROM users WHERE id_int = ${contributorUserId}`,
    db
  );
  await dbInsert(
    sql`INSERT INTO contributor_affiliations (version_id_int, user_id_int, affiliated_org_id_int, id, version_id, user_id, affiliated_org_id) VALUES (${versionId}, ${contributorUserId}, ${orgId}, ULID(), ${versionUlid}, ${contributorUserUlid}, ${orgAffUlid})`,
    db
  );
  return c.json({ publication_id: publicationId, version_id: versionId });
});

app.delete("/:slug/contrib-affiliation", async (c) => {
  const slug = c.req.param("slug");
  const contributorUserIdStr = c.req.query("user_id");
  const orgSlug = c.req.query("org_slug");
  if (!contributorUserIdStr || !orgSlug)
    return c.json({ error: "Missing user_id or org_slug" }, 400);
  const contributorUserId = parseInt(contributorUserIdStr, 10);
  if (isNaN(contributorUserId))
    return c.json({ error: "Invalid user_id" }, 400);

  const userId = await getSessionUserId(c);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  const db = getDb();
  const versionId = await getDraftVersionId(publicationId, db);
  if (!versionId) return c.json({ error: "No draft version found" }, 400);

  const orgId = (await dbSelectValue(
    sql`SELECT id_int FROM organizations WHERE slug = ${orgSlug} AND state = 'ACTIVE' LIMIT 1`,
    db
  )) as number | null;
  if (!orgId) return c.json({ error: "Organization not found" }, 404);

  await dbUpdate(
    sql`DELETE FROM contributor_affiliations WHERE version_id_int = ${versionId} AND user_id_int = ${contributorUserId} AND affiliated_org_id_int = ${orgId}`,
    db
  );
  return c.json({ publication_id: publicationId, version_id: versionId });
});

app.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);
  await dbUpdate(
    sql`UPDATE publications SET state = 'DELETED' WHERE id_int = ${publicationId}`,
    getDb()
  );
  return c.body(null, 204);
});

app.put("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const latestVersionNumber = pubRow["latest_version_number"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  const pubState = pubRow["state"] as string;
  if (!(await canEdit(userId, publicationId, ownerId)))
    return c.json({ error: "Permission denied" }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const newSlug = ((body["slug"] as string) ?? slug).trim().toLowerCase();
  let shouldUpdateSlug = false;
  if (newSlug !== slug) {
    const slugErr = validateSlug(newSlug, pubState);
    if (slugErr) return c.json({ error: slugErr }, 400);
    const existingSlug = await getPublicationBySlug(newSlug);
    if (existingSlug) return c.json({ error: "Slug already exists" }, 409);
    shouldUpdateSlug = true;
  }

  const doi = emptyToNull(body["doi"] as string | null);
  let shouldUpdateDoi = false;
  if (doi !== pubRow["doi"]) {
    if (pubState !== "DRAFT")
      return c.json({ error: "DOI can only be changed while drafting" }, 400);
    if (doi) {
      const err = validateDoi(doi);
      if (err) return c.json({ error: err }, 400);
    }
    shouldUpdateDoi = true;
  }

  const title = emptyToNull(body["title"] as string | null);
  const subtitle = emptyToNull(body["subtitle"] as string | null);
  const abstract = emptyToNull(body["abstract"] as string | null);
  const bodyText = emptyToNull(body["body"] as string | null);
  const version_desc = emptyToNull(body["version_desc"] as string | null);
  const license = emptyToNull(body["license"] as string | null) ?? "CC BY";

  if (subtitle && subtitle.length > 300)
    return c.json({ error: "Subtitle must be 300 characters or less" }, 400);
  const pubUlid = pubRow["id"] as string;
  // The media import worker rewrites the body as uploads finish, so a body
  // saved now could drop its replacements.
  if (
    bodyText != null &&
    (await makeRepositories().imports.hasUnsettledMediaImport(pubUlid))
  )
    return c.json({ error: MEDIA_IMPORT_IN_PROGRESS_MESSAGE }, 409);
  for (const field of [
    "feedback_form_embed_src",
    "social_posts_embed_src",
  ] as const) {
    const val = emptyToNull(body[field] as string | null);
    if (val) {
      const err = validateEmbedSrc(val);
      if (err) return c.json({ error: err }, 400);
    }
  }

  let uploadedBody = bodyText ?? "";
  let draftVersionId: number;
  let draftVersionUlid: string;
  const db = getDb();
  /**
   * Originally we would upload the media first, and if that failed we would
   * skip creating the draft, but since we need the version ULID to run upload
   * now, lookup needs to happen first.
   *
   * So this is wrapped in a transaction so that all changes are rolled back if
   * the upload fails.
   */
  try {
    const ids = await db.transaction(async (tx) => {
      let id: number;
      try {
        [id] = await getDraftVersionIdOrCreateNew(
          publicationId,
          latestVersionNumber,
          tx
        );
      } catch (e) {
        c.var.logger.error({ err: e }, "Failed to get/create draft");
        throw new PutSlugTxError(500, "Draft could not be created", {
          cause: e,
        });
      }

      const versionUlid = (await dbSelectValue(
        sql`SELECT id from versions where id_int = ${id}`,
        tx
      )) as string;

      if (bodyText) {
        try {
          uploadedBody =
            (await uploadBodyMediaToS3({
              body: bodyText,
              publicationId: pubUlid,
              versionId: versionUlid,
              repos: makeRepositories().withTx(tx),
            })) ?? uploadedBody;
        } catch (e) {
          c.var.logger.error({ err: e }, "Media upload failed");
          throw new PutSlugTxError(400, String(e), { cause: e });
        }
      }

      return { draftVersionId: id, draftVersionUlid: versionUlid };
    });
    draftVersionId = ids.draftVersionId;
    draftVersionUlid = ids.draftVersionUlid;
  } catch (e) {
    if (e instanceof PutSlugTxError) {
      // ROLLBACK has already run by this point
      return c.json({ error: e.message }, e.status);
    }
    throw e;
  }

  // Build version SET clause — only include fields that were actually provided.
  // subtitle is always updated (null when absent/empty); others are no-ops if undefined.
  const versionSetClauses: SQL[] = [sql`subtitle = ${subtitle}`];
  if (title != null) versionSetClauses.push(sql`title = ${title}`);
  if (abstract != null) versionSetClauses.push(sql`abstract = ${abstract}`);
  if (bodyText != null) versionSetClauses.push(sql`body = ${uploadedBody}`);
  if (version_desc != null)
    versionSetClauses.push(sql`version_desc = ${version_desc}`);
  await dbUpdate(
    sql`UPDATE versions SET ${sql.join(versionSetClauses, sql`, `)} WHERE id_int = ${draftVersionId}`,
    db
  );

  const pubSetClauses: SQL[] = [sql`license = ${license}`];
  if ("feedback_form_embed_src" in body) {
    const v = emptyToNull(body["feedback_form_embed_src"] as string | null);
    pubSetClauses.push(sql`feedback_form_embed_src = ${v}`);
  }
  if ("social_posts_embed_src" in body) {
    const v = emptyToNull(body["social_posts_embed_src"] as string | null);
    pubSetClauses.push(sql`social_posts_embed_src = ${v}`);
  }
  await dbUpdate(
    sql`UPDATE publications SET ${sql.join(pubSetClauses, sql`, `)} WHERE id_int = ${publicationId}`,
    db
  );

  if (shouldUpdateDoi) {
    try {
      await dbUpdate(
        sql`UPDATE publications SET doi = ${doi} WHERE id_int = ${publicationId}`,
        db
      );
    } catch (e) {
      c.var.logger.error({ err: e }, "DOI update error");
      return c.json(
        { error: "Failed to update DOI (it may be a duplicate)" },
        400
      );
    }
  }
  if (shouldUpdateSlug) {
    try {
      await dbUpdate(
        sql`UPDATE publications SET slug = ${newSlug} WHERE id_int = ${publicationId}`,
        db
      );
    } catch (e) {
      c.var.logger.error({ err: e }, "Slug update error");
      return c.json(
        { error: "Failed to update slug (it may be a duplicate)" },
        400
      );
    }
  }

  if (abstract != null || bodyText != null) {
    const log = c.var.logger;
    extractAndStoreVersionReferences(draftVersionId, {
      ...(await getVersionReferenceInput(draftVersionId, db)),
      abstract,
      body: uploadedBody,
    }).catch((e) =>
      log.error({ err: e }, "Failed to extract and store references")
    );
  }

  // Mint draft DOIs if applicable
  if (title && (await isDoiMintingEnabled(publicationId))) {
    try {
      const draftRow = await dbSelect(
        sql`SELECT version_number, doi FROM versions WHERE id_int = ${draftVersionId}`,
        db
      );
      if (draftRow.length > 0) {
        const draftVersionNumber = draftRow[0]!["version_number"] as number;
        const draftVersionDoi = draftRow[0]!["doi"] as string | null;
        if (!draftVersionDoi) {
          const effectiveSlug = shouldUpdateSlug ? newSlug : slug;
          const canonicalDoi = shouldUpdateDoi
            ? doi
            : (pubRow["doi"] as string | null);
          const today = new Date().toISOString().slice(0, 10);
          if (!canonicalDoi) {
            const [cDoi, vDoi] = await mintDoisForNewPubDraft(
              makeRepositories(),
              pubUlid,
              draftVersionUlid,
              {
                slug: effectiveSlug,
                title,
                subtitle: subtitle ?? "",
                abstract: abstract ?? "",
                license,
                versionDesc: version_desc ?? "",
                publishDate: today,
                draft: true,
              }
            );
            if (cDoi)
              await dbUpdate(
                sql`UPDATE publications SET doi = ${cDoi} WHERE id_int = ${publicationId}`,
                db
              );
            if (vDoi)
              await dbUpdate(
                sql`UPDATE versions SET doi = ${vDoi} WHERE id_int = ${draftVersionId}`,
                db
              );
          } else {
            const vDoi = await mintDoiForNewVersionDraft(
              makeRepositories(),
              pubUlid,
              draftVersionUlid,
              {
                slug: effectiveSlug,
                title,
                subtitle: subtitle ?? "",
                abstract: abstract ?? "",
                license,
                versionNumber: draftVersionNumber,
                versionDesc: version_desc ?? "",
                publishDate: today,
                canonicalDoi,
                draft: true,
                // If the publication has already been published (this
                // draft is a subsequent version), the concept DOI is
                // already public and must keep reflecting that published
                // version's metadata — only the version DOI should be
                // touched while this draft is being edited.
                updateCanonical: pubState !== "PUBLISHED",
              }
            );
            if (vDoi)
              await dbUpdate(
                sql`UPDATE versions SET doi = ${vDoi} WHERE id_int = ${draftVersionId}`,
                db
              );
          }
        }
      }
    } catch (e) {
      c.var.logger.error({ err: e }, "Draft DOI minting error");
    }
  }

  return c.json({ publication: "ok" });
});

/**
 * Get publication details. If version_number is provided, returns that version (if user
 * has access). Otherwise returns latest published version (if user has access).
 *
 * Deleted publications with DOIs always return their latest version, regardless of the version_number
 * requested, so that removed publications remain accessible at a single, stable version.
 *
 * Format of version_number is "v{number}", e.g. v1, v2, etc.
 */
async function getVersion(
  c: Context<AppEnv, string, BlankInput>,
  slug: string,
  versionNumber: number,
  ext?: string
) {
  if (isNaN(versionNumber)) {
    return c.var.jsonErrors({ errors: ["Invalid version number"] }, 400);
  }
  const userId = await getSessionUserId(c);
  const pubRow = await getPublicationBySlug(slug);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (isDeletedNotRemoved(pubRow)) {
    return c.json({ error: "Publication not found" }, 404);
  }
  const selectedVersionNumber =
    pubRow["state"] === "DELETED"
      ? (pubRow["latest_version_number"] as number)
      : versionNumber;

  const versionRows = await dbSelect(
    sql`SELECT ${VERSION_RESPONSE_COLUMNS} FROM versions WHERE publication_id_int = ${publicationId} AND version_number = ${selectedVersionNumber} LIMIT 1`,
    getDb()
  );
  if (versionRows.length === 0)
    return c.json({ error: `Version ${selectedVersionNumber} not found` }, 404);
  const versionRow = versionRows[0]!;

  if (
    (pubRow["state"] === "DRAFT" || versionRow["state"] === "DRAFT") &&
    !(await canViewDraft(userId, publicationId, ownerId))
  ) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const publication = await buildGetPublicationResponse(pubRow, versionRow);

  // Only include the Vary header if the extension is not specified, to indicate
  // that the response may vary based on the Accept header.
  const varyHeader: object | { Vary: string } = !ext ? { Vary: "Accept" } : {};

  if (
    mediaType(c.req.header("Accept"), ["application/json", "text/markdown"]) ===
      "text/markdown" ||
    ext === "md"
  ) {
    return c.text(await publicationToAgentMarkdown(publication), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      ...varyHeader,
    });
  }

  return c.json({ publication }, 200, {
    ...varyHeader,
  });
}

app.get("/:slug/:version_number{v[0-9]+\\.(md|json)}", async (c) => {
  const slug = c.req.param("slug");
  const [versionNumberStr, ext] = c.req.param("version_number").split(".");

  // Version number is in the format `v{number}`, so we need to strip the leading "v"
  const versionNumber = parseInt(versionNumberStr!.replace("v", ""), 10);
  return getVersion(c, slug, versionNumber, ext);
});

app.get("/:slug/:version_number{v[0-9]+}", async (c) => {
  const slug = c.req.param("slug");

  // Version number is in the format `v{number}`, so we need to strip the leading "v"
  const versionNumber = parseInt(
    c.req.param("version_number").replace("v", ""),
    10
  );
  return getVersion(c, slug, versionNumber);
});

async function getPub(
  c: Context<AppEnv, string, BlankInput>,
  slug: string,
  ext?: string
) {
  const userId = await getSessionUserId(c);
  const pubRow = await getPublicationBySlug(slug!);
  if (!pubRow) return c.json({ error: "Publication not found" }, 404);
  const publicationId = pubRow["id_int"] as number;
  const ownerId = pubRow["owner_id_int"] as number;
  if (isDeletedNotRemoved(pubRow)) {
    return c.json({ error: "Publication not found" }, 404);
  }

  const versionNumber = pubRow["latest_version_number"] as number;
  const versionRows = await dbSelect(
    sql`SELECT ${VERSION_RESPONSE_COLUMNS} FROM versions WHERE publication_id_int = ${publicationId} AND version_number = ${versionNumber} LIMIT 1`,
    getDb()
  );
  if (versionRows.length === 0)
    return c.json({ error: "Version not found" }, 404);
  const versionRow = versionRows[0]!;

  if (
    (pubRow["state"] === "DRAFT" || versionRow["state"] === "DRAFT") &&
    !(await canViewDraft(userId, publicationId, ownerId))
  ) {
    return c.json({ error: "Permission denied" }, 403);
  }

  const publication = await buildGetPublicationResponse(pubRow, versionRow);

  // Only include the Vary header if the extension is not specified, to indicate
  // that the response may vary based on the Accept header.
  const varyHeader: object | { Vary: string } = !ext ? { Vary: "Accept" } : {};

  if (
    mediaType(c.req.header("Accept"), ["application/json", "text/markdown"]) ===
      "text/markdown" ||
    ext === "md"
  ) {
    return c.text(await publicationToAgentMarkdown(publication), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      ...varyHeader,
    });
  }

  return c.json({ publication }, 200, {
    ...varyHeader,
  });
}

app.get("/:slug{.*\\.(md|json)}", async (c) => {
  const [slug, ext] = c.req.param("slug").split(".");
  return getPub(c, slug!, ext);
});

app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  return getPub(c, slug);
});

export default app;
