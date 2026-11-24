/**
 * Keeps two files in step with the v1 routes' `stability`, and checks that
 * stable operations only change compatibly:
 *
 * - `api-v1/README.md`'s endpoint tables, between the `v1-endpoints` markers.
 * - `api-v1/openapi.stable.json`, the OpenAPI document cut down to the
 *   stable operations, so it only changes when the stable contract does.
 *
 *   pnpm v1:contract                 compare the routes with both files,
 *                                    reporting breaking changes to stable
 *                                    operations and stale files; writes
 *                                    nothing
 *   pnpm v1:contract --regenerate    rewrite both files
 *   pnpm v1:contract --base <file>   only report breaking changes against
 *                                    <file> (a base branch's
 *                                    `openapi.stable.json`); writes nothing
 *
 * A breaking change is a stable operation that is gone or no longer stable
 * (checked here, since oasdiff lets deprecated operations be removed), or
 * anything oasdiff `breaking` rates a warning or error. oasdiff is skipped
 * with a notice when it isn't installed, except in CI.
 */
import { initConfig } from "#src/config.js";
import { createV1App } from "#v1/routes/app-v1.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import prettier from "prettier";

type Operation = {
  summary?: string;
  deprecated?: boolean;
  "x-stability-level"?: string;
};
type OpenApiDocument = {
  servers?: unknown;
  paths: Record<string, Record<string, Operation>>;
  components?: Record<string, Record<string, unknown>>;
};
type OperationEntry = { method: string; path: string; operation: Operation };

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);
const START_MARKER = "<!-- v1-endpoints:start -->";
const END_MARKER = "<!-- v1-endpoints:end -->";
const API_V1_DIR = join(import.meta.dirname, "../api-v1");
const README_PATH = join(API_V1_DIR, "README.md");
const STABLE_SPEC_PATH = join(API_V1_DIR, "openapi.stable.json");
const SEVERITY_LEVELS_PATH = join(API_V1_DIR, "oasdiff-severity-levels.txt");
const REGENERATE_COMMAND = "pnpm -F @raven/backend-ts v1:contract --regenerate";

const { values: args } = parseArgs({
  options: {
    regenerate: { type: "boolean", default: false },
    base: { type: "string" },
  },
});

if (args.regenerate && args.base !== undefined) {
  fail(["--regenerate and --base can't be combined."]);
}

initConfig();
const response = await createV1App().request("/openapi.json");
const document = (await response.json()) as OpenApiDocument;

const operations = listOperations(document);
const isStable = (entry: OperationEntry) =>
  entry.operation["x-stability-level"] === "stable";

const stableSpec = {
  path: STABLE_SPEC_PATH,
  content: await format(
    STABLE_SPEC_PATH,
    JSON.stringify(toStableDocument(document))
  ),
};
const readme = {
  path: README_PATH,
  content: await format(
    README_PATH,
    replaceEndpointTables(readFileSync(README_PATH, "utf-8"), operations)
  ),
};
const generated = [stableSpec, readme];

if (args.regenerate) {
  for (const { path, content } of generated) {
    if (readFileSync(path, "utf-8") === content) {
      log(`${path} is up to date.`);
      continue;
    }
    writeFileSync(path, content);
    log(`Wrote ${path}.`);
  }
} else if (args.base !== undefined) {
  const { problems, oasdiffRan } = findBreakingChanges(
    args.base,
    stableSpec.content
  );
  if (problems.length > 0) fail(problems);
  log(
    oasdiffRan
      ? "No breaking changes to stable v1 operations."
      : "No stable v1 operations were removed or demoted (oasdiff wasn't run)."
  );
} else {
  const stale = generated.filter(
    ({ path, content }) => readFileSync(path, "utf-8") !== content
  );
  if (stale.length === 0) {
    log("No v1 API changes to check.");
  } else {
    const { problems, oasdiffRan } = stale.includes(stableSpec)
      ? findBreakingChanges(STABLE_SPEC_PATH, stableSpec.content)
      : { problems: [], oasdiffRan: true };
    if (problems.length === 0) {
      log(
        oasdiffRan
          ? "The v1 API changed without breaking stable operations."
          : "The v1 API changed without removing or demoting stable " +
              "operations (oasdiff wasn't run)."
      );
    }
    fail([
      ...problems,
      "The v1 API changed, but these files don't match the routes yet. " +
        `Run \`${REGENERATE_COMMAND}\` and commit them:\n` +
        stale.map(({ path }) => `  ${path}`).join("\n"),
    ]);
  }
}

/**
 * Compares the stable operations in `basePath` with `revision`, the
 * routes' current stable spec.
 */
function findBreakingChanges(
  basePath: string,
  revision: string
): { problems: string[]; oasdiffRan: boolean } {
  const base = JSON.parse(readFileSync(basePath, "utf-8")) as OpenApiDocument;
  const stable = new Set(operations.filter(isStable).map(operationKey));
  const destabilized = listOperations(base)
    .map(operationKey)
    .filter((key) => !stable.has(key));
  const problems =
    destabilized.length > 0
      ? [
          "Stable v1 operations were removed or are no longer stable.\n" +
            destabilized.map((key) => `  ${key}`).join("\n"),
        ]
      : [];
  const oasdiffProblems = runOasdiff(basePath, revision);
  return {
    problems: [...problems, ...(oasdiffProblems ?? [])],
    oasdiffRan: oasdiffProblems !== undefined,
  };
}

/**
 * oasdiff only rates removing an optional response field or an error status
 * as info, but clients rely on both, so the severity levels file raises them
 * to warnings and any warning counts as breaking. Returns `undefined` when
 * oasdiff isn't installed outside CI.
 */
function runOasdiff(basePath: string, revision: string): string[] | undefined {
  const dir = mkdtempSync(join(tmpdir(), "v1-api-contract-"));
  const revisionPath = join(dir, "openapi.stable.json");
  writeFileSync(revisionPath, revision);
  const result = spawnSync(
    "oasdiff",
    [
      "breaking",
      basePath,
      revisionPath,
      "--severity-levels",
      SEVERITY_LEVELS_PATH,
      "--fail-on",
      "WARN",
    ],
    { encoding: "utf-8" }
  );
  rmSync(dir, { recursive: true });

  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
    const notice =
      "oasdiff isn't installed; " +
      "install it with `brew install oasdiff`, or " +
      "see https://github.com/oasdiff/oasdiff#installation.";
    if (process.env.CI) return [notice];
    log(notice);
    return undefined;
  }
  if (result.error) throw result.error;
  if (result.status === 0) return [];
  return [
    "oasdiff found breaking changes to stable v1 operations:\n" +
      `${result.stdout}${result.stderr}`.trim(),
  ];
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(message);
}

function fail(problems: string[]): never {
  // eslint-disable-next-line no-console
  console.error(problems.join("\n\n"));
  process.exit(1);
}

function listOperations(doc: OpenApiDocument): OperationEntry[] {
  return Object.entries(doc.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => HTTP_METHODS.has(method))
      .map(([method, operation]) => ({ method, path, operation }))
  );
}

function operationKey({ method, path }: OperationEntry): string {
  return `${method.toUpperCase()} ${path}`;
}

/**
 * Only the stable operations and the components they reference, without
 * `servers` (it comes from local config), so the file only changes when the
 * stable contract does.
 */
function toStableDocument(doc: OpenApiDocument): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  for (const entry of listOperations(doc).filter(isStable)) {
    paths[entry.path] = {
      ...paths[entry.path],
      [entry.method]: entry.operation,
    };
  }
  const { servers: _servers, ...rest } = doc;
  return {
    ...rest,
    paths,
    components: referencedComponents(paths, doc.components ?? {}),
  };
}

function referencedComponents(
  paths: OpenApiDocument["paths"],
  components: NonNullable<OpenApiDocument["components"]>
): NonNullable<OpenApiDocument["components"]> {
  const kept: NonNullable<OpenApiDocument["components"]> = {
    securitySchemes: components.securitySchemes ?? {},
  };
  const pending = collectRefs(paths);
  const seen = new Set<string>();
  for (let ref = pending.pop(); ref !== undefined; ref = pending.pop()) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const [, section, name] =
      /^#\/components\/([^/]+)\/([^/]+)$/.exec(ref) ?? [];
    if (section === undefined || name === undefined) continue;
    const component = components[section]?.[name];
    if (component === undefined) continue;
    kept[section] = { ...kept[section], [name]: component };
    pending.push(...collectRefs(component));
  }
  return sortComponents(kept);
}

function collectRefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectRefs);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "$ref" && typeof child === "string" ? [child] : collectRefs(child)
  );
}

function sortComponents(
  components: NonNullable<OpenApiDocument["components"]>
): NonNullable<OpenApiDocument["components"]> {
  return Object.fromEntries(
    Object.entries(components)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([section, entries]) => [
        section,
        Object.fromEntries(
          Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))
        ),
      ])
  );
}

function replaceEndpointTables(
  current: string,
  entries: OperationEntry[]
): string {
  const start = current.indexOf(START_MARKER);
  const end = current.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${README_PATH} must contain ${START_MARKER} followed by ${END_MARKER}`
    );
  }
  const stable = entries.filter(isStable);
  const alpha = entries.filter((entry) => !isStable(entry));
  const generated = [
    START_MARKER,
    "<!-- Generated from the routes' `stability` by `pnpm v1:contract --regenerate`; don't edit by hand. -->",
    `### Stable (${stable.length})`,
    endpointTable(stable),
    `### Alpha (${alpha.length})`,
    endpointTable(alpha),
  ].join("\n\n");
  return current.slice(0, start) + generated + "\n\n" + current.slice(end);
}

function endpointTable(entries: OperationEntry[]): string {
  const rows = entries.map(({ method, path, operation }) => {
    const summary = operation.deprecated
      ? `${operation.summary ?? ""} (deprecated)`
      : (operation.summary ?? "");
    return `| \`${method.toUpperCase()}\` | \`/api/v1${path}\` | ${summary} |`;
  });
  return ["| Method | Path | Summary |", "| --- | --- | --- |", ...rows].join(
    "\n"
  );
}

async function format(filepath: string, source: string): Promise<string> {
  const options = await prettier.resolveConfig(filepath);
  return prettier.format(source, { ...options, filepath });
}
