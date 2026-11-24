// Mock of two unrelated real services that backend-ts's DOI handling talks
// to, so integration tests never need real internet access:
//
// 1. The DataCite REST API (https://api.datacite.org/dois), exercising
//    backend-ts's DOI-minting code paths (src/lib/datacite.ts).
// 2. Plain doi.org content negotiation (GET https://doi.org/<doi> with an
//    Accept: application/vnd.citationstyles.csl+json header), exercising
//    reference-URL enrichment (fetchCslJson in src/lib/references.ts).
//    backend-ts points at this mock for both via DATACITE_API and
//    DOI_RESOLVER_API (see docker-compose.test.yml) - they happen to share
//    a container here purely for convenience, not because the two APIs are
//    related.
//
// Surface mocked:
//   POST /dois        - create a DOI. Always succeeds: Raven only ever
//                        requests this under its own configured prefix
//                        (OWN_PREFIX below), which a real DataCite account
//                        can always mint under. The request may ask for a
//                        specific, deterministic DOI (attributes.doi, used
//                        when deriving a version DOI from a concept DOI's
//                        suffix - see deriveVersionDoi in datacite.ts) or
//                        auto-generation under a prefix (attributes.prefix,
//                        used for a brand-new concept DOI) - both are
//                        honored below.
//   GET  /dois/:doi    - fetch a DOI's current attributes (used by
//                        updatePreviousVersionLink in datacite.ts to read
//                        the previous version's existing relatedIdentifiers
//                        before patching in a new one). 404 if unknown.
//   PUT  /dois/:doi    - update a DOI's metadata (":doi" itself contains a
//                        "/", e.g. "10.83972/mock-1", so it is NOT a single
//                        path segment - see the startsWith() match below).
//                        Rejected with 403 whenever the target DOI's prefix
//                        is not OWN_PREFIX, simulating a real DataCite
//                        account trying to write to a DOI under a prefix it
//                        does not control (e.g. one a user supplied at
//                        publication-creation time). Matching real DataCite
//                        behavior, any attribute not present in the request
//                        body is left unchanged rather than cleared - so the
//                        mock keeps per-DOI state and merges into it, rather
//                        than replacing it wholesale.
//   GET  /dois/:doi    - fetch a previously created/updated DOI's record
//                        (see dataciteRawGet in src/lib/datacite/client.ts).
//                        404s for a DOI this mock has never seen a
//                        successful POST/PUT for, mirroring real DataCite
//                        for an unknown DOI.
//   DELETE /dois/:doi  - delete a DOI (real DataCite only allows this for
//                        drafts; the mock doesn't track state and deletes
//                        any DOI it knows). 403 outside OWN_PREFIX, 404 for
//                        an unknown DOI.
//   GET  /<doi>        - DOI content-negotiation resolution. Any path that
//                        isn't /dois, /dois/:doi, or /_mock/* is treated as a
//                        bare DOI (e.g. "/10.1234/some-suffix"). Returns a
//                        generic CSL-JSON document for any DOI, provided the
//                        request carries the CSL-JSON Accept header
//                        fetchCslJson always sends; otherwise 406, and
//                        anything else 404 - mirroring real doi.org close
//                        enough for reference enrichment to exercise its
//                        success and failure paths without hitting it.
//
// Test-control surface (not part of either real API):
//   GET  /_mock/health  - liveness check for the container healthcheck
//   POST /_mock/reset    clears the recorded call log (and any
//                        /_mock/fail-delete failures) only, for test
//                        assertion isolation - stored DOI records persist
//                        across a reset, matching real DataCite (a DOI
//                        record from an earlier publish, e.g. v1's, must
//                        still be there for updatePreviousVersionLink's GET
//                        when a later publish, e.g. v2's, runs)
//   POST /_mock/fail-delete  body { doi }: makes DELETE /dois/:doi for that
//                        DOI return 500 until the next /_mock/reset, to
//                        exercise DataCite failure handling.
//   GET  /_mock/calls    returns every /dois call recorded since the last
//                        reset, including the response status returned, so
//                        tests can assert whether minting was attempted,
//                        what was sent, and how it resolved.
"use strict";

const http = require("node:http");

const OWN_PREFIX = process.env.OWN_PREFIX ?? "10.83972";

let calls = [];
let doiCounter = 0;
// DOIs whose DELETE should fail; cleared by /_mock/reset.
let failingDeletes = new Set();
// Last known attributes per DOI, keyed by the DOI string. Populated on a
// successful create/update so GET /dois/:doi has something to return; never
// cleared by /_mock/reset (that only clears the recorded call log), mirroring
// doiCounter's lifetime -- a DOI persists at "DataCite" for the whole test run.
const dois = new Map();
// doi -> attributes, as DataCite would persist them server-side. A PUT
// merges into this rather than replacing it, mirroring the real API.
let records = new Map();

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

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/vnd.api+json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
  return status;
}

function prefixRejectedError() {
  return {
    errors: [
      {
        status: "403",
        title:
          "The prefix in this request is not associated with the authenticated account.",
      },
    ],
  };
}

function notFoundError() {
  return { errors: [{ status: "404", title: "Not found" }] };
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return send(res, 400, { errors: [{ status: "400", title: "Bad URL" }] });
  }

  try {
    if (req.method === "GET" && url.pathname === "/_mock/health") {
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/_mock/reset") {
      calls = [];
      failingDeletes = new Set();
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/_mock/fail-delete") {
      const body = await readJsonBody(req);
      failingDeletes.add(body.doi);
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/_mock/calls") {
      return send(res, 200, { calls });
    }

    if (req.method === "POST" && url.pathname === "/dois") {
      const body = await readJsonBody(req);
      const requestedDoi = body?.data?.attributes?.doi;
      let doi;
      if (requestedDoi) {
        const requestedPrefix = String(requestedDoi).split("/")[0];
        if (requestedPrefix !== OWN_PREFIX) {
          const status = send(res, 403, prefixRejectedError());
          calls.push({ method: "POST", path: url.pathname, body, status });
          return;
        }
        // The caller asked for a specific, deterministic DOI rather than
        // auto-generation under a prefix - honor it verbatim.
        doi = requestedDoi;
      } else {
        const prefix = body?.data?.attributes?.prefix ?? "10.0000";
        doiCounter += 1;
        doi = `${prefix}/mock-${doiCounter}`;
      }
      const attributes = { ...body.data.attributes, doi };
      records.set(doi, attributes);
      const status = send(res, 201, {
        data: { id: doi, type: "dois", attributes },
      });
      dois.set(doi, attributes);
      calls.push({ method: "POST", path: url.pathname, body, status });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/dois/")) {
      // The DOI itself contains a "/" (e.g. "10.83972/mock-1"), so everything
      // after "/dois/" is the DOI - it is not a single path segment.
      const doi = url.pathname.slice("/dois/".length);
      const record = records.get(doi);
      const status = record
        ? send(res, 200, {
            data: { id: doi, type: "dois", attributes: record },
          })
        : send(res, 404, notFoundError());
      calls.push({
        method: "GET",
        path: url.pathname,
        doi,
        body: null,
        status,
      });
      return;
    }

    if (req.method === "PUT" && url.pathname.startsWith("/dois/")) {
      // The DOI itself contains a "/" (e.g. "10.83972/mock-1"), so everything
      // after "/dois/" is the DOI - it is not a single path segment.
      const doi = url.pathname.slice("/dois/".length);
      const body = await readJsonBody(req);
      const prefix = doi.split("/")[0];
      let status;
      if (prefix !== OWN_PREFIX) {
        status = send(res, 403, prefixRejectedError());
      } else {
        // Real DataCite treats an unspecified attribute as "leave as-is"
        // (see the write-access probe's comment in datacite.ts), so merge
        // over whatever's already on file rather than replacing it -- an
        // empty-attributes probe PUT must not blank out a real record.
        const attributes = {
          ...(dois.get(doi) ?? {}),
          ...body.data.attributes,
          doi,
        };
        // A real DataCite update leaves any attribute not present in the
        // request body unchanged (the write-access probe in datacite.ts
        // relies on this, PUTing an empty attributes object as a no-op) -
        // so merge into the stored record instead of replacing it.
        const existing = records.get(doi) ?? {};
        const merged = { ...existing, ...(body?.data?.attributes ?? {}), doi };
        records.set(doi, merged);
        status = send(res, 200, {
          data: { id: doi, type: "dois", attributes },
        });
        dois.set(doi, attributes);
      }
      calls.push({ method: "PUT", path: url.pathname, doi, body, status });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/dois/")) {
      const doi = url.pathname.slice("/dois/".length);
      let status;
      if (doi.split("/")[0] !== OWN_PREFIX) {
        status = send(res, 403, prefixRejectedError());
      } else if (failingDeletes.has(doi)) {
        status = send(res, 500, {
          errors: [{ status: "500", title: "Internal server error" }],
        });
      } else if (!records.has(doi)) {
        status = send(res, 404, notFoundError());
      } else {
        records.delete(doi);
        dois.delete(doi);
        res.writeHead(204);
        res.end();
        status = 204;
      }
      calls.push({
        method: "DELETE",
        path: url.pathname,
        doi,
        body: null,
        status,
      });
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname !== "/dois" &&
      !url.pathname.startsWith("/dois/") &&
      !url.pathname.startsWith("/_mock/")
    ) {
      const doi = url.pathname.slice(1); // strip leading "/"
      const accept = req.headers["accept"] || "";
      if (!accept.includes("application/vnd.citationstyles.csl+json")) {
        send(res, 406, {
          errors: [{ status: "406", title: "Not acceptable" }],
        });
        return;
      }
      send(res, 200, {
        title: `Mock Title for ${doi}`,
        author: [{ family: "Mockauthor", given: "Anne" }],
        issued: { "date-parts": [[2024]] },
      });
      return;
    }

    send(res, 404, { errors: [{ status: "404", title: "Not found" }] });
  } catch (e) {
    send(res, 500, { errors: [{ status: "500", title: String(e) }] });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4321;
server.listen(PORT, () => {
  console.log(`DataCite mock listening on :${PORT}`);
});
