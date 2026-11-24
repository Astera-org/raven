import type { AppEnv } from "#src/types/hono.js";
import { dbSelect, type Row } from "#v0/lib/db/db-select.js";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

const app = new Hono<AppEnv>();

function formatLastmod(dt: Date | string | null | undefined): string {
  if (!dt) return new Date().toISOString().slice(0, 10);
  const d = dt instanceof Date ? dt : new Date(String(dt));
  return isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10);
}

function getBaseUrl(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "";
  const hostWithoutPort = host.split(":")[0] ?? "";
  let effectiveHost = host;
  if (
    hostWithoutPort !== "thestacks.org" &&
    !/^thestacks-org-.*-astera-institute\.vercel\.app$/.test(hostWithoutPort) &&
    hostWithoutPort !== "localhost"
  ) {
    effectiveHost = "thestacks.org";
  }
  const protocol = effectiveHost.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${effectiveHost}`;
}

async function getPublicationsRows(): Promise<Row[]> {
  return dbSelect(
    sql`SELECT p.slug, v.created_at as lastmod FROM publications p JOIN versions v ON v.publication_id_int = p.id_int AND v.version_number = p.latest_version_number WHERE p.state = 'PUBLISHED' ORDER BY v.created_at DESC`
  );
}

async function getOrganizationsRows(): Promise<Row[]> {
  return dbSelect(
    sql`SELECT o.slug, GREATEST(COALESCE(o.updated_at, o.created_at), COALESCE(MAX(p.created_at), o.created_at)) as lastmod FROM organizations o LEFT JOIN org_publication_map opm ON opm.org_id_int = o.id_int LEFT JOIN publications p ON p.id_int = opm.publication_id_int AND p.state = 'PUBLISHED' WHERE o.state = 'ACTIVE' AND o.unlisted = FALSE GROUP BY o.slug, o.updated_at, o.created_at ORDER BY lastmod DESC`
  );
}

async function getUsersRows(): Promise<Row[]> {
  return dbSelect(
    sql`SELECT u.username, GREATEST(COALESCE(u.updated_at, u.created_at), COALESCE(MAX(p.created_at), u.created_at)) as lastmod FROM users u LEFT JOIN contributors c ON c.user_id_int = u.id_int LEFT JOIN versions v ON v.id_int = c.version_id_int LEFT JOIN publications p ON p.id_int = v.publication_id_int AND v.version_number = p.latest_version_number AND p.state = 'PUBLISHED' WHERE u.state IN ('ACTIVE') GROUP BY u.username, u.updated_at, u.created_at ORDER BY lastmod DESC`
  );
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", async (c) => {
  const baseUrl = getBaseUrl(c);
  const [pubRows, orgRows, userRows] = await Promise.all([
    getPublicationsRows(),
    getOrganizationsRows(),
    getUsersRows(),
  ]);

  const pubLastmod =
    pubRows.length > 0
      ? formatLastmod(pubRows[0]!["lastmod"] as string)
      : formatLastmod(null);
  const orgLastmod =
    orgRows.length > 0
      ? formatLastmod(orgRows[0]!["lastmod"] as string)
      : formatLastmod(null);
  const userLastmod =
    userRows.length > 0
      ? formatLastmod(userRows[0]!["lastmod"] as string)
      : formatLastmod(null);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemaps/sitemap-publications.xml</loc>
    <lastmod>${pubLastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemaps/sitemap-organizations.xml</loc>
    <lastmod>${orgLastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemaps/sitemap-users.xml</loc>
    <lastmod>${userLastmod}</lastmod>
  </sitemap>
</sitemapindex>`;

  return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

app.get("/publications", async (c) => {
  const baseUrl = getBaseUrl(c);
  const rows = await getPublicationsRows();
  const urls = rows.map(
    (r) =>
      `  <url>\n    <loc>${baseUrl}/publications/${r["slug"]}</loc>\n    <lastmod>${formatLastmod(r["lastmod"] as string)}</lastmod>\n  </url>`
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

app.get("/organizations", async (c) => {
  const baseUrl = getBaseUrl(c);
  const rows = await getOrganizationsRows();
  const urls = rows.map(
    (r) =>
      `  <url>\n    <loc>${baseUrl}/organizations/${r["slug"]}</loc>\n    <lastmod>${formatLastmod(r["lastmod"] as string)}</lastmod>\n  </url>`
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

app.get("/users", async (c) => {
  const baseUrl = getBaseUrl(c);
  const rows = await getUsersRows();
  const urls = rows.map(
    (r) =>
      `  <url>\n    <loc>${baseUrl}/users/${r["username"]}</loc>\n    <lastmod>${formatLastmod(r["lastmod"] as string)}</lastmod>\n  </url>`
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

export default app;
