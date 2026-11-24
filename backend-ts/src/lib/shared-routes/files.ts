import { getConfig } from "#src/config.js";
import type { AppEnv } from "#src/types/hono.js";
import { Hono, type Context } from "hono";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

// Each API version supplies its own not-found response so the shared lookup
// can return that version's error envelope.
export function createFilesRouter(notFound: (c: Context<AppEnv>) => Response) {
  // Named wildcard capture, so this is the path relative to wherever this
  // router is mounted (e.g. /api/files or /api/v0/files), not the full
  // request path.
  return new Hono<AppEnv>().get("/:path{.+}", async (c) => {
    const cfg = getConfig();
    const imgDir = cfg.IMG_DIR;
    const requestedPath = c.req.param("path");

    // Prevent directory traversal
    const safePath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = join(imgDir, safePath);

    // Ensure the resolved path stays within imgDir
    if (!fullPath.startsWith(normalize(imgDir))) {
      return notFound(c);
    }

    try {
      const data = await readFile(fullPath);
      const ext = extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      return c.body(data, 200, { "Content-Type": contentType });
    } catch {
      return notFound(c);
    }
  });
}
