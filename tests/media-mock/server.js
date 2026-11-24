// Mock of a Google-hosted media server, so integration tests can exercise
// backend-ts's media upload pipeline (src/lib/media/upload-body-media-to-s3.ts)
// without real internet access.
//
// The backend only uploads media from an allowlist of Google domains (see
// should-upload-media.ts), which checks the hostname alone - not the scheme
// or port. docker-compose.test.yml gives this container the network alias
// lh3.googleusercontent.com, so a body containing
// `:::image{src=http://lh3.googleusercontent.com/pixel.png}` resolves here
// from inside the backend container.
//
// Surface mocked:
//   GET|HEAD /<name>   - serve tests/fixtures/media/<name> with a
//                        Content-Type derived from its extension and a
//                        Last-Modified header (the backend's HEAD request
//                        hashes Last-Modified into the S3 key - see
//                        fetch-version-id.ts). 404 for unknown files.
//   GET|HEAD /missing.png    - always 404, for download-failure handling.
//   GET|HEAD /unavailable.png - always 503, for transient-failure handling.
//   GET|HEAD /corrupt.png    - bytes that aren't an image, served as
//                              image/png, for unreadable-media handling.
//   GET|HEAD /notes.txt      - a text/plain body, for unsupported-type
//                              handling.
//   GET|HEAD /mislabeled.png - pixel.png's bytes served as
//                              application/octet-stream, for the fallback
//                              from Content-Type to URL extension / sniffing.
//   GET /document/d/<id>/export - Google Docs HTML export, served from
//                              tests/fixtures/google-docs/<id>.html. 404 for
//                              unknown ids. `private` is served like Google's
//                              sign-in page, without Content-Disposition, and
//                              `status-<code>` (e.g. status-503) answers with
//                              that status. `large` is a generated
//                              multi-megabyte export with 7 embedded PNGs. The backend reaches
//                              this via DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE,
//                              since it fetches docs.google.com over https.
//
// Test-control surface:
//   GET  /_mock/health        - liveness check for the container healthcheck
//   POST /_mock/reset         - clears the recorded call log and any
//                               Last-Modified overrides
//   GET  /_mock/calls         - every media request since the last reset,
//                               with the response status returned
//   POST /_mock/last-modified - body { name, lastModified? }: overrides
//                               Last-Modified for one file (defaults to now),
//                               simulating the upstream file being replaced
"use strict";

const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");

const FIXTURES_DIR = process.env.FIXTURES_DIR ?? "/fixtures";
const GOOGLE_DOCS_FIXTURES_DIR =
  process.env.GOOGLE_DOCS_FIXTURES_DIR ?? "/google-docs-fixtures";
const GOOGLE_DOC_EXPORT_PATH = /^\/document\/d\/([^/]+)\/export$/;
const DEFAULT_LAST_MODIFIED = new Date("2024-01-01T00:00:00Z").toUTCString();

const CONTENT_TYPES = {
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let calls = [];
// file name -> Last-Modified header value; cleared by /_mock/reset.
let lastModifiedOverrides = new Map();

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
  return status;
}

function sendMedia(req, res, name, buffer, contentType) {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": buffer.byteLength,
    "Last-Modified": lastModifiedOverrides.get(name) ?? DEFAULT_LAST_MODIFIED,
  });
  res.end(req.method === "HEAD" ? undefined : buffer);
  return 200;
}

async function readFixture(name) {
  try {
    return await readFile(path.join(FIXTURES_DIR, name));
  } catch {
    return null;
  }
}

async function serveMedia(req, res, name) {
  if (name === "missing.png") return sendJson(res, 404, { error: "Not found" });
  if (name === "unavailable.png") {
    return sendJson(res, 503, { error: "Service unavailable" });
  }

  if (name === "corrupt.png") {
    return sendMedia(req, res, name, Buffer.from("not a png"), "image/png");
  }

  if (name === "notes.txt") {
    return sendMedia(req, res, name, Buffer.from("hello\n"), "text/plain");
  }

  if (name === "mislabeled.png") {
    const buffer = await readFixture("pixel.png");
    if (!buffer) return sendJson(res, 404, { error: "Not found" });
    return sendMedia(req, res, name, buffer, "application/octet-stream");
  }

  const contentType = CONTENT_TYPES[path.extname(name).toLowerCase()];
  const buffer = contentType ? await readFixture(name) : null;
  if (!buffer) return sendJson(res, 404, { error: "Not found" });
  return sendMedia(req, res, name, buffer, contentType);
}

// Google sends its sign-in page for a private doc as a normal page, not as an
// attachment like a real export.
const SIGN_IN_PAGE_IDS = new Set(["private"]);
const STATUS_ID = /^status-(\d{3})$/;
const LARGE_DOC_ID = "large";

function pngChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

// Stored without compression, so a solid colour still takes size² × 3 bytes.
function solidPng([r, g, b], size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  const row = Buffer.alloc(1 + size * 3); // leading 0 = no row filter
  for (let x = 0; x < size; x++) row.set([r, g, b], 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(pixels, { level: 0 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Generated rather than committed, so the fixtures stay small while the
// export is multi-megabyte. Its embedded images are moved out of the body,
// leaving text that still overflows TEXT's 64 KiB.
function largeDocExport() {
  // Few long paragraphs; many short ones make the conversion slow.
  const sentence = "The quick brown fox jumps over the lazy dog. ";
  const paragraphs = Array.from(
    { length: 40 },
    (_, i) => `<p><span>${i}. ${sentence.repeat(40)}</span></p>`
  );
  const colors = [
    [255, 0, 0],
    [255, 128, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 0, 255],
    [75, 0, 130],
    [148, 0, 211],
  ];
  const images = colors.map(
    (color) =>
      `<p><img src="data:image/png;base64,${solidPng(color, 256).toString("base64")}" /></p>`
  );
  return Buffer.from(
    `<html><body><p class="title"><span>Large Export</span></p>${paragraphs.join("")}${images.join("")}</body></html>`
  );
}

async function serveGoogleDocExport(res, id) {
  const status = id.match(STATUS_ID);
  if (status) {
    res.writeHead(Number(status[1]), {
      "Content-Type": "text/html; charset=utf-8",
    });
    return res.end("<html><body>Error</body></html>");
  }

  let html;
  try {
    // basename() keeps requests inside GOOGLE_DOCS_FIXTURES_DIR.
    html =
      id === LARGE_DOC_ID
        ? largeDocExport()
        : await readFile(
            path.join(GOOGLE_DOCS_FIXTURES_DIR, `${path.basename(id)}.html`)
          );
  } catch {
    return sendJson(res, 404, { error: "Not found" });
  }
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": html.byteLength,
    ...(!SIGN_IN_PAGE_IDS.has(id) && {
      "Content-Disposition": `attachment; filename="${id}.html"`,
    }),
  });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return sendJson(res, 400, { error: "Bad URL" });
  }

  try {
    if (req.method === "GET" && url.pathname === "/_mock/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/_mock/reset") {
      calls = [];
      lastModifiedOverrides = new Map();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/_mock/calls") {
      return sendJson(res, 200, { calls });
    }

    if (req.method === "POST" && url.pathname === "/_mock/last-modified") {
      const body = await readJsonBody(req);
      if (!body?.name) return sendJson(res, 400, { error: "Missing name" });
      const lastModified = body.lastModified
        ? new Date(body.lastModified)
        : new Date();
      lastModifiedOverrides.set(body.name, lastModified.toUTCString());
      return sendJson(res, 200, { ok: true });
    }

    const googleDocExport = url.pathname.match(GOOGLE_DOC_EXPORT_PATH);
    if (req.method === "GET" && googleDocExport) {
      return serveGoogleDocExport(res, decodeURIComponent(googleDocExport[1]));
    }

    if (req.method === "GET" || req.method === "HEAD") {
      // basename() keeps requests inside FIXTURES_DIR.
      const name = path.basename(decodeURIComponent(url.pathname));
      const status = await serveMedia(req, res, name);
      calls.push({ method: req.method, path: url.pathname, status });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (e) {
    sendJson(res, 500, { error: String(e) });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 80;
server.listen(PORT, () => {
  console.log(`Media mock listening on :${PORT}`);
});
