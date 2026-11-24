import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";

export interface Config {
  DATABASE_URI: string;
  BASE_URL_WEB: string;
  BASE_URL_API: string;
  SERVER_HOST: string;
  SERVER_PORT: number;
  SERVER_DEBUG: boolean;
  JWT_SECRET_KEY: string;
  OUT_DIR: string;
  IMG_DIR: string;
  DATACITE_API: string;
  DATACITE_NAME: string;
  DATACITE_PASSWORD: string;
  DATACITE_PREFIX: string;
  ENVIRONMENT: string;
  ORCID_CLIENT_ID: string;
  ORCID_CLIENT_SECRET: string;
  ORCID_USE_SANDBOX: boolean;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AWS_S3_BUCKET_NAME: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  PDF_QUEUE_URL: string;
  MAILGUN_API_KEY: string;
  TEST_RECIPIENT_EMAIL_ADDRESS: string;
}

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

function bool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

/** @deprecated - kept until everyone's config migrates over */
function normalizeDatabaseUri(uri: string): string {
  // Accept SQLAlchemy-style mysql+pymysql:// (used by the Python backend) and
  // strip the driver qualifier so mysql2 receives a plain mysql:// URL.
  return uri.replace(/^mysql\+[^:]+:\/\//, "mysql://");
}

function fromRecord(data: Record<string, unknown>): Config {
  const cfg: Config = {
    DATABASE_URI: normalizeDatabaseUri(str(data["DATABASE_URI"])),
    SERVER_HOST: str(data["SERVER_HOST"], "0.0.0.0", true),
    SERVER_PORT: num(data["SERVER_PORT"], 7001, true),
    SERVER_DEBUG: bool(data["SERVER_DEBUG"], true),
    JWT_SECRET_KEY: str(data["JWT_SECRET_KEY"], "CHANGE_ME", true),
    OUT_DIR: str(data["OUT_DIR"], "out/", true),
    IMG_DIR: str(data["IMG_DIR"], "imgs/", true),
    DATACITE_API: str(
      data["DATACITE_API"],
      "https://api.datacite.org/dois",
      true
    ),
    DATACITE_NAME: str(data["DATACITE_NAME"]),
    DATACITE_PASSWORD: str(data["DATACITE_PASSWORD"]),
    DATACITE_PREFIX: str(data["DATACITE_PREFIX"]),
    ENVIRONMENT: str(data["ENVIRONMENT"]),
    BASE_URL_WEB: str(data["BASE_URL_WEB"]).replace(/\/$/, ""),
    BASE_URL_API: str(data["BASE_URL_API"]).replace(/\/$/, ""),
    ORCID_CLIENT_ID: str(data["ORCID_CLIENT_ID"]),
    ORCID_CLIENT_SECRET: str(data["ORCID_CLIENT_SECRET"]),
    ORCID_USE_SANDBOX: bool(data["ORCID_USE_SANDBOX"], false),
    GOOGLE_CLIENT_ID: str(data["GOOGLE_CLIENT_ID"]),
    GOOGLE_CLIENT_SECRET: str(data["GOOGLE_CLIENT_SECRET"]),
    AWS_S3_BUCKET_NAME: str(data["AWS_S3_BUCKET_NAME"]),
    AWS_ACCESS_KEY_ID: str(data["AWS_ACCESS_KEY_ID"]),
    AWS_SECRET_ACCESS_KEY: str(data["AWS_SECRET_ACCESS_KEY"]),
    AWS_REGION: str(data["AWS_REGION"], "us-west-2", true),
    PDF_QUEUE_URL: str(data["PDF_QUEUE_URL"]),
    MAILGUN_API_KEY: str(data["MAILGUN_API_KEY"]),
    TEST_RECIPIENT_EMAIL_ADDRESS: str(data["TEST_RECIPIENT_EMAIL_ADDRESS"]),
  };
  return cfg;
}

let _config: Config | null = null;

export function initConfig(tomlPath = "raven.toml"): Config {
  const resolvedPath = join(process.cwd(), tomlPath);
  const raw = readFileSync(resolvedPath, "utf-8");
  const data = parse(raw) as Record<string, unknown>;
  _config = fromRecord(data);
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
