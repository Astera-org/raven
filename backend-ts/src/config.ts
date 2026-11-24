import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";

export class ConfigError extends Error {
  override name = "ConfigError";
  constructor(
    public configKey: keyof Config,
    message = "Invalid configuration",
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

export interface Config {
  DATABASE_URI: string;
  SERVER_HOST: string;
  SERVER_PORT: number;
  SERVER_DEBUG: boolean;
  MIGRATION_DATABASE_URI: string;
  PG_DATABASE_URI: string;
  MIGRATION_PG_DATABASE_URI: string;
  JWT_SECRET_KEY: string;
  BETTER_AUTH_SECRET: string;
  OUT_DIR: string;
  IMG_DIR: string;
  DATACITE_API: string;
  DATACITE_NAME: string;
  DATACITE_PASSWORD: string;
  DATACITE_PREFIX: string;
  DATACITE_PUBLISHER: string;
  DOI_RESOLVER_API: string;
  ENVIRONMENT: string;
  BASE_URL_WEB: string;
  BASE_URL_ADMIN: string;
  BASE_URL_API: string;
  DEVICE_VERIFICATION_PATH: string;
  ORCID_CLIENT_ID: string;
  ORCID_CLIENT_SECRET: string;
  ORCID_USE_SANDBOX: boolean;
  ORCID_REDIRECT_URI_BASE: string | undefined;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AWS_S3_BUCKET_NAME: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_S3_ENDPOINT: string;
  AWS_S3_PUBLIC_ENDPOINT: string;
  AWS_S3_PUBLIC_BASE_URL: string;
  PDF_QUEUE_URL: string;
  MAILGUN_API_KEY: string;
  MAILGUN_API_URL: string | null;
  TEST_RECIPIENT_EMAIL_ADDRESS: string;
  LINEAR_API_KEY: string;
  LINEAR_TEAM_ID: string;
  LINEAR_TRIAGE_STATE_ID: string;
  LOG_LEVEL: string;
  LOG_FILE: string;
  LOG_ROTATION: string;
  LOG_MAX_SIZE: string;
  LOG_TO_FILE: boolean | null;
  MEDIA_MAX_BYTES: number;
  BIBLIOGRAPHY_MAX_BYTES: number;
  MYST_MDAST_ENABLED: boolean;
  REQUIRE_EMAIL_VERIFICATION: boolean;
  TURNSTILE_SECRET_KEY: string;
  SESSION_ELEVATION_MAX_AGE_SEC: number;
  MYST_MDAST_CACHE_BYTES: number;
  MYST_MDAST_MAX_SOURCE_BYTES: number;
  PUBLICATION_CREATOR_ORGS: string[];
  awsConfig: ReturnType<typeof awsConfigFromRecord>;
  baseConfig: ReturnType<typeof baseConfigFromRecord>;
  dataciteConfig: ReturnType<typeof dataciteConfigFromRecord>;
  EXTRA_ALLOWED_ORIGIN_PATTERN: string;
  DEV_MEDIA_ORIGIN_OVERRIDE: string;
  DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE: string;
}

const DEFAULT_MEDIA_MAX_BYTES = 350 * 1024 * 1024;
const DEFAULT_BIBLIOGRAPHY_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MYST_MDAST_CACHE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MYST_MDAST_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const DEFAULT_SESSION_ELEVATION_MAX_AGE_SEC = 10 * 60;
const DEFAULT_PUBLICATION_CREATOR_ORGS = ["Arcadia Science", "Radial"];

function str(v: unknown, fallback = "", ignoreEmpty = false): string {
  if (v === undefined || v === null || (ignoreEmpty && v === ""))
    return fallback;
  return String(v);
}

function num(v: unknown, fallback: number, ignoreEmpty = false): number {
  if (v === undefined || v === null || (ignoreEmpty && v === ""))
    return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

/** Like `num`, but warns and falls back when the value is set and not positive. */
function positiveNum(name: string, v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (n > 0) return n;
  // The logger reads the config, so it isn't available here.
  // eslint-disable-next-line no-console
  console.warn(
    `${name} must be a positive number, not ${JSON.stringify(v)}; using the default, ${fallback}.`
  );
  return fallback;
}

/** Accepts a TOML array or a comma-separated string; unset or empty falls back. */
function list(v: unknown, fallback: string[]): string[] {
  if (v === undefined || v === null || v === "") return fallback;
  const items = Array.isArray(v) ? v.map(String) : String(v).split(",");
  return items.map((item) => item.trim()).filter((item) => item !== "");
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

/** @deprecated - kept while configs continue to use python style */
function normalizeDatabaseUri(uri: string): string {
  // Accept SQLAlchemy-style mysql+pymysql:// (used by the Python backend) and
  // strip the driver qualifier so mysql2 receives a plain mysql:// URL.
  return uri.replace(/^mysql\+[^:]+:\/\//, "mysql://");
}

function removeTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function awsConfigFromRecord(data: Record<string, unknown>) {
  return {
    AWS_S3_BUCKET_NAME: str(data["AWS_S3_BUCKET_NAME"]),
    AWS_ACCESS_KEY_ID: str(data["AWS_ACCESS_KEY_ID"]),
    AWS_SECRET_ACCESS_KEY: str(data["AWS_SECRET_ACCESS_KEY"]),
    AWS_REGION: str(data["AWS_REGION"], "us-west-2", true),
    // Custom S3-compatible endpoint (e.g. a local Garage instance). Leave
    // empty to use real AWS S3.
    AWS_S3_ENDPOINT: str(data["AWS_S3_ENDPOINT"], "", true),
    // Endpoint used when building public URLs returned to clients; falls
    // back to AWS_S3_ENDPOINT when unset (e.g. the server and browser share
    // one reachable host), and to real AWS S3 when both are empty.
    AWS_S3_PUBLIC_ENDPOINT: str(
      data["AWS_S3_PUBLIC_ENDPOINT"],
      str(data["AWS_S3_ENDPOINT"], "", true),
      true
    ),
    // Local Garage only: its web endpoint picks the bucket from the Host
    // header, so public URLs use this base as-is. Presigned uploads still go
    // to AWS_S3_PUBLIC_ENDPOINT.
    AWS_S3_PUBLIC_BASE_URL: removeTrailingSlash(
      str(data["AWS_S3_PUBLIC_BASE_URL"], "", true)
    ),
  };
}

function baseConfigFromRecord(data: Record<string, unknown>) {
  return {
    DATABASE_URI: normalizeDatabaseUri(str(data["DATABASE_URI"])),
    MIGRATION_DATABASE_URI: normalizeDatabaseUri(
      str(data["MIGRATION_DATABASE_URI"])
    ),
    PG_DATABASE_URI: str(data["PG_DATABASE_URI"]).trim(),
    MIGRATION_PG_DATABASE_URI: str(
      data["MIGRATION_PG_DATABASE_URI"] || data["PG_DATABASE_URI"]
    ).trim(),
    BASE_URL_WEB: removeTrailingSlash(str(data["BASE_URL_WEB"])),
    BASE_URL_ADMIN: removeTrailingSlash(str(data["BASE_URL_ADMIN"])),
    BASE_URL_API: removeTrailingSlash(str(data["BASE_URL_API"])),
    ENVIRONMENT: str(data["ENVIRONMENT"]),
    SERVER_HOST: str(data["SERVER_HOST"], "0.0.0.0", true),
    SERVER_PORT: num(data["SERVER_PORT"], 7001, true),
    SERVER_DEBUG: bool(data["SERVER_DEBUG"], false),
    JWT_SECRET_KEY: str(
      data["JWT_SECRET_KEY"],
      "dev-secret-key-change-in-production",
      true
    ),
    BETTER_AUTH_SECRET: str(data["BETTER_AUTH_SECRET"], "CHANGE_ME", true),
    OUT_DIR: str(data["OUT_DIR"], "out/", true),
    IMG_DIR: str(data["IMG_DIR"], "imgs/", true),
  };
}

function dataciteConfigFromRecord(data: Record<string, unknown>) {
  return {
    DATACITE_API: str(
      data["DATACITE_API"],
      "https://api.datacite.org/dois",
      true
    ),
    DATACITE_NAME: str(data["DATACITE_NAME"]),
    DATACITE_PASSWORD: str(data["DATACITE_PASSWORD"]),
    DATACITE_PREFIX: str(data["DATACITE_PREFIX"]),
    DATACITE_PUBLISHER: str(data["DATACITE_PUBLISHER"], "The Stacks", true),
    // Base URL for DOI content-negotiation lookups (CSL-JSON enrichment of
    // reference URLs, see src/lib/references.ts). Overridable so tests can
    // point it at a mock instead of hitting the real doi.org.
    DOI_RESOLVER_API: removeTrailingSlash(
      str(data["DOI_RESOLVER_API"], "https://doi.org", true)
    ),
  };
}

function orcidConfigFromRecord(data: Record<string, unknown>) {
  let orcidRedirectUriBase =
    data["ORCID_REDIRECT_URI_BASE"] == null
      ? undefined
      : removeTrailingSlash(str(data["ORCID_REDIRECT_URI_BASE"]));
  if (orcidRedirectUriBase === "") {
    orcidRedirectUriBase = undefined;
  }
  return {
    ORCID_CLIENT_ID: str(data["ORCID_CLIENT_ID"]),
    ORCID_CLIENT_SECRET: str(data["ORCID_CLIENT_SECRET"]),
    ORCID_USE_SANDBOX: bool(data["ORCID_USE_SANDBOX"], false),
    ORCID_REDIRECT_URI_BASE: orcidRedirectUriBase,
  };
}

function fromRecord(data: Record<string, unknown>): Config {
  // In the future, we should move to using the structure sub-configs rather than the big flat one.
  const baseConfig = baseConfigFromRecord(data);
  const awsConfig = awsConfigFromRecord(data);
  const dataciteConfig = dataciteConfigFromRecord(data);
  const orcidConfig = orcidConfigFromRecord(data);
  const cfg: Config = {
    DATABASE_URI: baseConfig.DATABASE_URI,
    MIGRATION_DATABASE_URI: baseConfig.MIGRATION_DATABASE_URI,
    PG_DATABASE_URI: baseConfig.PG_DATABASE_URI,
    MIGRATION_PG_DATABASE_URI: baseConfig.MIGRATION_PG_DATABASE_URI,
    BASE_URL_WEB: baseConfig.BASE_URL_WEB,
    BASE_URL_ADMIN: baseConfig.BASE_URL_ADMIN,
    BASE_URL_API: baseConfig.BASE_URL_API,
    DEVICE_VERIFICATION_PATH: str(
      data["DEVICE_VERIFICATION_PATH"],
      "/device",
      true
    )
      // Ensure a leading slash
      .replace(/^\/?/, "/"),
    ENVIRONMENT: baseConfig.ENVIRONMENT,
    SERVER_HOST: baseConfig.SERVER_HOST,
    SERVER_PORT: baseConfig.SERVER_PORT,
    SERVER_DEBUG: baseConfig.SERVER_DEBUG,
    JWT_SECRET_KEY: baseConfig.JWT_SECRET_KEY,
    BETTER_AUTH_SECRET: baseConfig.BETTER_AUTH_SECRET,
    OUT_DIR: baseConfig.OUT_DIR,
    IMG_DIR: baseConfig.IMG_DIR,
    DATACITE_API: dataciteConfig.DATACITE_API,
    DATACITE_NAME: dataciteConfig.DATACITE_NAME,
    DATACITE_PASSWORD: dataciteConfig.DATACITE_PASSWORD,
    DATACITE_PREFIX: dataciteConfig.DATACITE_PREFIX,
    DATACITE_PUBLISHER: dataciteConfig.DATACITE_PUBLISHER,
    DOI_RESOLVER_API: dataciteConfig.DOI_RESOLVER_API,
    ORCID_CLIENT_ID: orcidConfig.ORCID_CLIENT_ID,
    ORCID_CLIENT_SECRET: orcidConfig.ORCID_CLIENT_SECRET,
    ORCID_USE_SANDBOX: orcidConfig.ORCID_USE_SANDBOX,
    ORCID_REDIRECT_URI_BASE: orcidConfig.ORCID_REDIRECT_URI_BASE,
    GOOGLE_CLIENT_ID: str(data["GOOGLE_CLIENT_ID"]),
    GOOGLE_CLIENT_SECRET: str(data["GOOGLE_CLIENT_SECRET"]),
    AWS_S3_BUCKET_NAME: awsConfig.AWS_S3_BUCKET_NAME,
    AWS_ACCESS_KEY_ID: awsConfig.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: awsConfig.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: awsConfig.AWS_REGION,
    AWS_S3_ENDPOINT: awsConfig.AWS_S3_ENDPOINT,
    AWS_S3_PUBLIC_ENDPOINT: awsConfig.AWS_S3_PUBLIC_ENDPOINT,
    AWS_S3_PUBLIC_BASE_URL: awsConfig.AWS_S3_PUBLIC_BASE_URL,
    PDF_QUEUE_URL: str(data["PDF_QUEUE_URL"]),
    MAILGUN_API_KEY: str(data["MAILGUN_API_KEY"]),
    MAILGUN_API_URL: str(data["MAILGUN_API_URL"]) || null,
    TEST_RECIPIENT_EMAIL_ADDRESS: str(data["TEST_RECIPIENT_EMAIL_ADDRESS"]),
    LINEAR_API_KEY: str(data["LINEAR_API_KEY"]),
    LINEAR_TEAM_ID: str(data["LINEAR_TEAM_ID"]),
    LINEAR_TRIAGE_STATE_ID: str(data["LINEAR_TRIAGE_STATE_ID"]),
    LOG_LEVEL: str(data["LOG_LEVEL"], "info", true),
    LOG_FILE: str(data["LOG_FILE"], "logs/raven.log"),
    LOG_ROTATION: str(data["LOG_ROTATION"], "daily"),
    LOG_MAX_SIZE: str(data["LOG_MAX_SIZE"], "50m"),
    LOG_TO_FILE:
      data["LOG_TO_FILE"] !== undefined
        ? bool(data["LOG_TO_FILE"], baseConfig.SERVER_DEBUG ? false : true)
        : null,
    MEDIA_MAX_BYTES: positiveNum(
      "MEDIA_MAX_BYTES",
      data["MEDIA_MAX_BYTES"],
      DEFAULT_MEDIA_MAX_BYTES
    ),
    BIBLIOGRAPHY_MAX_BYTES: positiveNum(
      "BIBLIOGRAPHY_MAX_BYTES",
      data["BIBLIOGRAPHY_MAX_BYTES"],
      DEFAULT_BIBLIOGRAPHY_MAX_BYTES
    ),
    MYST_MDAST_ENABLED: bool(data["MYST_MDAST_ENABLED"], true),
    REQUIRE_EMAIL_VERIFICATION: bool(data["REQUIRE_EMAIL_VERIFICATION"], true),
    TURNSTILE_SECRET_KEY: str(data["TURNSTILE_SECRET_KEY"]),
    SESSION_ELEVATION_MAX_AGE_SEC: positiveNum(
      "SESSION_ELEVATION_MAX_AGE_SEC",
      data["SESSION_ELEVATION_MAX_AGE_SEC"],
      DEFAULT_SESSION_ELEVATION_MAX_AGE_SEC
    ),
    MYST_MDAST_CACHE_BYTES: num(
      data["MYST_MDAST_CACHE_BYTES"],
      DEFAULT_MYST_MDAST_CACHE_BYTES,
      true
    ),
    MYST_MDAST_MAX_SOURCE_BYTES: num(
      data["MYST_MDAST_MAX_SOURCE_BYTES"],
      DEFAULT_MYST_MDAST_MAX_SOURCE_BYTES,
      true
    ),
    PUBLICATION_CREATOR_ORGS: list(
      data["PUBLICATION_CREATOR_ORGS"],
      DEFAULT_PUBLICATION_CREATOR_ORGS
    ),
    awsConfig,
    baseConfig,
    dataciteConfig,
    EXTRA_ALLOWED_ORIGIN_PATTERN: str(data["EXTRA_ALLOWED_ORIGIN_PATTERN"]),
    // Local dev only: fetch googleusercontent.com media from this origin
    // instead (e.g. the integration tests' media mock). Ignored in production.
    DEV_MEDIA_ORIGIN_OVERRIDE: str(data["DEV_MEDIA_ORIGIN_OVERRIDE"]),
    // Local dev only: fetch Google Docs exports from this origin instead
    // (e.g. the integration tests' mock). Ignored in production.
    DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE: str(
      data["DEV_GOOGLE_DOCS_ORIGIN_OVERRIDE"]
    ),
  };
  return cfg;
}

let _config: Config | null = null;

export function initConfig(tomlPath?: string): Config {
  const usingDefaultPath = !tomlPath;
  const resolvedPath = tomlPath || join(process.cwd(), "raven.toml");
  // eslint-disable-next-line no-console
  console.log("Initializing config", { tomlPath, path: resolvedPath });
  let toml: Record<string, unknown> = {};
  try {
    const raw = readFileSync(resolvedPath, "utf-8");
    toml = parse(raw) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" || !usingDefaultPath)
      throw e;
  }
  // TOML values are the base, env vars take precedence when present
  _config = fromRecord({ ...toml, ...process.env });
  return _config;
}

export function getConfig(): Config {
  if (!_config)
    throw new Error(
      "Config has not been initialized. Call initConfig() first."
    );
  return _config;
}

export function getOrcidBaseUrl(): string {
  const cfg = getConfig();
  return cfg.ORCID_USE_SANDBOX
    ? "https://sandbox.orcid.org"
    : "https://orcid.org";
}
